var fs = require('fs');
var crypto = require('crypto');
var Step = require('step');
var path = require('path');
var url = require('url');
var mapnik = require('mapnik');
var qs = require('querystring');
var Pool = require('generic-pool').Pool;
var LockingCache = require('./lockingcache');

var cache = {};

if (process.platform !== 'win32') {
    // Increase number of threads to 1.5x the number of logical CPUs.
    var threads = Math.ceil(Math.max(4, require('os').cpus().length * 1.5));
    require('eio').setMinParallel(threads);
}

exports = module.exports = MapnikSource;

require('util').inherits(MapnikSource, require('events').EventEmitter);
function MapnikSource(uri, callback) {
    uri = this._normalizeURI(uri);
    var key = url.format(uri);

    if (uri.protocol && uri.protocol !== 'mapnik:') {
        throw new Error('Only the mapnik protocol is supported');
    }
    // by default we use an internal self-caching mechanism but
    // calling applications can pass `internal_cache:true` to disable
    // TODO - consider removing completely once https://github.com/mapbox/tilemill/issues/1893
    // is in place and a solid reference implementation of external caching
    if (uri.query.internal_cache === false) {
        this.once('open', callback);
        this._open(uri);
    } else {
        // https://github.com/mapbox/tilelive-mapnik/issues/47
        if (!cache[key]) {
            cache[key] = this;
            this._self_cache_key = key;
            this._open(uri);
        }
        var source = cache[key];
        source.setMaxListeners(0);
        if (!source.open) {
            source.once('open', function(err, source) {
                if (err) cache[key] = false;
                callback(err, source);
            });
        } else {
            callback(null, source);
        }
    }
    return undefined;
}

MapnikSource.prototype.toJSON = function() {
    return url.format(this._uri);
};

MapnikSource.prototype._normalizeURI = function(uri) {
    if (typeof uri === 'string') uri = url.parse(uri, true);
    if (uri.hostname === '.' || uri.hostname == '..') {
        uri.pathname = uri.hostname + uri.pathname;
        delete uri.hostname;
        delete uri.host;
    }
    uri.pathname = path.resolve(uri.pathname);
    uri.query = uri.query || {};
    if (typeof uri.query === 'string') uri.query = qs.parse(uri.query);
    if (typeof uri.query.internal_cache === "undefined") uri.query.internal_cache = true;
    if (!uri.query.base) uri.query.base = '';
    if (!uri.query.metatile) uri.query.metatile = 2;
    if (!uri.query.resolution) uri.query.resolution = 4;
    if (!uri.query.bufferSize) uri.query.bufferSize = 128;
    if (!uri.query.tileSize) uri.query.tileSize = 256;
    if (!uri.query.scale) uri.query.scale = 1;
    return uri;
};

// Finds all XML files in the filepath and returns their tilesource URI.
MapnikSource.list = function(filepath, callback) {
    filepath = path.resolve(filepath);
    fs.readdir(filepath, function(err, files) {
        if (err) return callback(err);
        for (var result = {}, i = 0; i < files.length; i++) {
            var name = files[i].match(/^([\w-]+)\.xml$/);
            if (name) result[name[1]] = 'mapnik://' + path.join(filepath, name[0]);
        }
        return callback(null, result);
    });
};

// Finds an XML file with the given ID in the filepath and returns a
// tilesource URI.
MapnikSource.findID = function(filepath, id, callback) {
    filepath = path.resolve(filepath);
    var file = path.join(filepath, id + '.xml');
    fs.stat(file, function(err, stats) {
        if (err) return callback(err);
        else return callback(null, 'mapnik://' + file);
    });
};

MapnikSource.prototype._open = function(uri) {
    var source = this;
    function error(err) {
        process.nextTick(function() {
            source.emit('open', err);
        });
    }

    this._stats = {
        render: 0,          // # of times a render is requested from mapnik
        total: 0,           // # of tiles returned from source
        encoded: 0,         // # of tiles encoded
        solid: 0,           // # of tiles isSolid
        solidPainted: 0     // # of tiles isSolid && painted
    };
    this._internal_cache = uri.query.internal_cache;
    this._base = uri.query.base;
    uri.query.metatile = +uri.query.metatile;
    uri.query.resolution = +uri.query.resolution;
    uri.query.bufferSize = +uri.query.bufferSize;
    uri.query.tileSize = +uri.query.tileSize;
    this._uri = uri;

    // Public API to announce how we're metatiling.
    this.metatile = uri.query.metatile;
    this.bufferSize = uri.query.bufferSize;

    // Initialize this map. This wraps `localize()` and calls `create()`
    // afterwards to actually create a new Mapnik map object.
    Step(function() {
        source._loadXML(this);
    }, function(err, xml) {
        if (err) return error(err);
        // https://github.com/mapbox/tilelive-mapnik/issues/25
        // there seems to be no value to assinging xml to a property
        //source._xml = xml;
        source._createMetatileCache();
        source._createPool(xml, this);
    }, function(err) {
        if (err) return error(err);
        source._populateInfo(this);
    }, function(err) {
        if (err) return error(err);
        source.open = true;
        source.emit('open', null, source);
    });
};

MapnikSource.prototype.close = function(callback) {
    this._close(function() {
        return callback();
    });
};

MapnikSource.prototype._cache = cache;

MapnikSource.prototype._close = function(callback) {
    if (cache[this._self_cache_key]) delete cache[this._self_cache_key];
    if (this._tileCache) this._tileCache.clear();
    // https://github.com/coopernurse/node-pool/issues/17#issuecomment-6565795
    if (this._pool) {
        var pool = this._pool;
        // NOTE: .drain() and .destoryAllNow() do
        // not pass error args
        pool.drain(function() {
            pool.destroyAllNow(function() {
                return callback();
            });
        });
    }
};

MapnikSource.registerProtocols = function(tilelive) {
    tilelive.protocols['mapnik:'] = MapnikSource;
};

// Loads the XML file from the specified path. Calls `callback` when the mapfile
// can be expected to be in `mapfile`. If this isn't successful, `callback` gets
// an error as its first argument.
MapnikSource.prototype._loadXML = function(callback) {
    var source = this;
    this._base = path.resolve(path.dirname(this._uri.pathname));

    // This is a string-based map file. Pass it on literally.
    if (this._uri.xml) return callback(null, this._uri.xml);

    // Load XML from file.
    fs.readFile(path.resolve(source._uri.pathname), 'utf8', function(err, xml) {
        if (err) return callback(err);
        callback(null, xml);
    });
};

// Create a new mapnik map object at `this.mapnik`. Requires that the mapfile
// be localized with `this.localize()`. This can be called in repetition because
// it won't recreate `this.mapnik`.
MapnikSource.prototype._createPool = function(xml, callback) {
    var source = this;
    if (!this._pool) this._pool = Pool({
        create: function(callback) {
            var map = new mapnik.Map(source._uri.query.tileSize, source._uri.query.tileSize);
            map.bufferSize = source._uri.query.bufferSize;
            var opts = {strict: false, base: source._base + '/'};
            //https://github.com/mapbox/tilelive-mapnik/issues/58
            try {
                map.fromStringSync(xml, opts);
                return callback(null, map);
            } catch (err) {
                return callback(err);
            }
        },
        destroy: function(map) {
            delete map;
        },
        // @TODO: need a smarter way to scale this. More
        // maps in pool seems better for PostGIS.
        max: require('os').cpus().length
    });
    callback(null);
};

MapnikSource.prototype._populateInfo = function(callback) {
    var source = this;
    var id = path.basename(this._uri.pathname, path.extname(this._uri.pathname));

    this._pool.acquire(function(err, map) {
        if (err) return callback(err);

        var info = { id: id, name: id, minzoom: 0, maxzoom: 22 };

        var p = map.parameters;
        for (var key in p) info[key] = p[key];
        if (p.bounds) info.bounds = p.bounds.split(',').map(parseFloat);
        if (p.center) info.center = p.center.split(',').map(parseFloat);
        if (p.minzoom) info.minzoom = parseInt(p.minzoom, 10);
        if (p.maxzoom) info.maxzoom = parseInt(p.maxzoom, 10);
        if (p.interactivity_fields) info.interactivity_fields = p.interactivity_fields.split(',');

        if (!info.bounds || info.bounds.length !== 4)
            info.bounds = [ -180, -85.05112877980659, 180, 85.05112877980659 ];

        if (!info.center || info.center.length !== 3) info.center = [
            (info.bounds[2] - info.bounds[0]) / 2 + info.bounds[0],
            (info.bounds[3] - info.bounds[1]) / 2 + info.bounds[1],
            2 ];

        source._info = info;
        source._pool.release(map);
        callback(null)
    });
};

// Creates a locking cache that generates tiles. When requesting the same tile
// multiple times, they'll be grouped to one request.
MapnikSource.prototype._createMetatileCache = function() {
    var source = this;
    this._tileCache = new LockingCache(function(key) {
        var cache = this;
        var coords = key.split(',');
        var keys = source._renderMetatile({
            metatile: source._uri.query.metatile,
            tileSize: source._uri.query.tileSize,
            format: coords[0],
            z: +coords[1],
            x: +coords[2],
            y: +coords[3]
        }, function(err, tiles) {
            if (err) {
                // Push error objects to all entries that were supposed to
                // be generated.
                keys.forEach(function(key) {
                    cache.put(key, err);
                });
            } else {
                // Put all the generated tiles into the locking cache.
                for (var key in tiles) {
                    cache.put(key, null, tiles[key].image, tiles[key].headers);
                }
            }
        });

        // Return a list of all the tile coordinates that are being rendered
        // as part of this metatile.
        return keys;
    },
    0); // purge immediately after callbacks
};

// Render handler for a given tile request.
MapnikSource.prototype.getTile = function(z, x, y, callback) {
    z = +z; x = +x; y = +y;
    if (isNaN(z) || isNaN(x) || isNaN(y)) {
        return callback(new Error('Invalid coordinates: '+z+'/'+x+'/'+y));
    }

    var max = (1 << z);
    if (x >= max || x < 0 || y >= max || y < 0) {
        return callback(new Error('Coordinates out of range: '+z+'/'+x+'/'+y));
    }

    var format = (this._info && this._info.format) || 'png';
    var key = [format, z, x, y].join(',');
    this._tileCache.get(key, function(err, tile, headers) {
        if (err) return callback(err);
        callback(null, tile, headers);
    });
};

MapnikSource.prototype.getGrid = function(z, x, y, callback) {
    z = +z; x = +x; y = +y;
    if (isNaN(z) || isNaN(x) || isNaN(y)) {
        return callback(new Error('Invalid coordinates: '+z+'/'+x+'/'+y));
    }

    var max = (1 << z);
    if (x >= max || x < 0 || y >= max || y < 0) {
        return callback(new Error('Coordinates out of range: '+z+'/'+x+'/'+y));
    } else if (!this._info ||
        !this._info.interactivity_fields ||
        !this._info.interactivity_layer) {
        if (!this._info) {
            return callback(new Error('Tilesource info is missing, cannot rendering interactivity'));
        } else {
            return callback(new Error('Tileset has no interactivity'));
        }
    } else if (!mapnik.supports.grid) {
        return callback(new Error('Mapnik is missing grid support'));
    }

    var key = ['utf', z, x, y].join(',');
    this._tileCache.get(key, function(err, grid, headers) {
        if (err) return callback(err);
        delete grid.solid;
        callback(null, grid, headers);
    });
};

MapnikSource.prototype.getInfo = function(callback) {
    if (this._info) callback(null, this._info);
    else callback(new Error('Info is unavailable'));
};

// Add other functions.
require('./render');

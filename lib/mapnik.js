var fs = require('fs');
var crypto = require('crypto');
var Step = require('step');
var path = require('path');
var url = require('url');
var mapnik = require('mapnik');
var qs = require('querystring');
var Pool = require('generic-pool').Pool;
var LockingCache = require('./lockingcache');
var sm = new (require('sphericalmercator'));

var cache = {};

// Increase number of threads to 1.5x the number of logical CPUs.
var threads = Math.ceil(Math.max(4, require('os').cpus().length * 1.5));
require('eio').setMinParallel(threads);

exports = module.exports = MapnikSource;

require('util').inherits(MapnikSource, require('events').EventEmitter);
function MapnikSource(uri, callback) {
    uri = this._normalizeURI(uri);
    var key = url.format(uri);

    if (uri.protocol && uri.protocol !== 'mapnik:') {
        throw new Error('Only the mapnik protocol is supported');
    }

    if (!cache[key]) {
        cache[key] = this;
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
    return undefined;
}

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
    if (!uri.query.cache) uri.query.cache = '/tmp/';
    if (!uri.query.base) uri.query.base = '';
    if (!uri.query.metatile) uri.query.metatile = 2;
    if (!uri.query.resolution) uri.query.resolution = 4;
    if (!uri.query.bufferSize) uri.query.bufferSize = 128;
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

    this._cache = uri.query.cache;
    this._base = uri.query.base;
    uri.query.metatile = +uri.query.metatile;
    uri.query.resolution = +uri.query.resolution;
    uri.query.bufferSize = +uri.query.bufferSize;
    this._uri = uri;

    // Public API to announce how we're metatiling.
    this.metatile = uri.query.metatile;
    this.bufferSize = uri.query.bufferSize;

    // Initialize this map. This wraps `localize()` and calls `create()`
    // afterwards to actually create a new Mapnik map object.
    Step(function() {
        source._loadXML(this);
    }, function(err, xml, mml) {
        if (err) return error(err);
        source._xml = xml;
        source._mml = mml;
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

MapnikSource.prototype._close = function() {
    if (this._cache) this._cache.clear();
    // Note: this doesn't clear timeouts in node-pool.
    // See https://github.com/coopernurse/node-pool/issues/17
    if (this._pool) {
        this._pool.drain();
        this._pool.destroyAllNow();
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
    var xml, mml;
    Step(function() {
        if (source._uri.xml) {
            // This is a string-based map file. Pass it on literally.
            source._base = path.resolve(path.dirname(source._uri.pathname));
            this(null, source._uri.xml);
        } else {
            // This is a file-based map file. Load it from the file.
            source._base = path.resolve(path.dirname(source._uri.pathname));
            fs.readFile(path.resolve(source._uri.pathname), 'utf8', this);
        }
    }, function(err, data) {
        if (err) return callback(err);
        xml = data;

        if (source._uri.mml) {
            // This is an MML object. Pass it on literally.
            this(null, source._uri.mml);
        } else {
            var p = path.resolve(source._uri.pathname);
            var filepath = path.join(path.dirname(p), path.basename(p, path.extname(p))) + '.mml';
            fs.readFile(filepath, 'utf8', this);
        }
    }, function(err, data) {
        // Only care about the error if it's something different from "file not found".
        if (err && err.code !== 'ENOENT') return callback(err);

        if (data) {
            // An accompanying MML file exists.
            if (typeof data === 'string') {
                try { mml = JSON.parse(data); }
                catch (err) { return callback(err); }
            } else {
                mml = data;
            }
        }

        callback(null, xml, mml);
    });
};

// Create a new mapnik map object at `this.mapnik`. Requires that the mapfile
// be localized with `this.localize()`. This can be called in repetition because
// it won't recreate `this.mapnik`.
MapnikSource.prototype._createPool = function(xml, callback) {
    var source = this;
    if (!this._pool) this._pool = Pool({
        create: function(callback) {
            var map = new mapnik.Map(256, 256);
            map.bufferSize = source._uri.query.bufferSize;
            map.fromString(xml, {
                strict: false,
                base: source._base + '/'
            }, function(err, map) {
                if (err) return callback(err);
                // Wrap zoomAll() with a try/catch and don't bail on error.
                // Certain layers/projections seem to cause an error here that
                // need not be fatal.
                try { map.zoomAll(); } catch(e) {};
                callback(null, map);
            });
        },
        destroy: function(map) {
            map.clear();
            delete map;
        },
        max: 5
    });
    callback(null);
};

MapnikSource.prototype._populateInfo = function(callback) {
    var source = this;
    var info = {
        name: path.basename(this._uri.pathname, path.extname(this._uri.pathname)),

        // We can't determine a sensible minzoom/maxzoom
        minzoom: 0,
        maxzoom: 22
    };

    info.id = info.name;

    if (this._mml && this._mml.center) info.center = this._mml.center;
    if (this._mml && this._mml.bounds) info.bounds = this._mml.bounds;
    if (info.bounds && info.center) {
        source._info = info;
        return callback(null);
    }

    this._pool.acquire(function(err, map) {
        if (err) return callback(err);
        info.bounds = sm.convert(map.extent);
        source._pool.release(map);

        // sm.convert may sometimes return -180.00000000000003 or crap like that.
        if (info.bounds[0] < -180) info.bounds[0] = -180;
        if (info.bounds[1] < -90) info.bounds[1] = -90;
        if (info.bounds[2] > 180) info.bounds[2] = 180;
        if (info.bounds[3] > 90) info.bounds[3] = 90;

        if (!info.center || info.center.length !== 3) {
            info.center = [
                (info.bounds[2] - info.bounds[0]) / 2 + info.bounds[0],
                (info.bounds[3] - info.bounds[1]) / 2 + info.bounds[1],
                2
            ];
        }

        // This is currently a synchronous operation.
        source._info = info;
        callback(null);
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
    });
};

// Render handler for a given tile request.
MapnikSource.prototype.getTile = function(z, x, y, callback) {
    var max = (1 << z);
    if (x >= max || x < 0 || y >= max || y < 0) {
        return callback(new Error('Coordinates out of range: %d/%d/%d', z, x, y));
    }

    var format = (this._mml && this._mml.format) || 'png';
    var key = [format, z, x, y].join(',');
    this._tileCache.get(key, function(err, tile, headers) {
        if (err) return callback(err);
        callback(null, tile, headers);
    });
};

MapnikSource.prototype.getGrid = function(z, x, y, callback) {
    var max = (1 << z);
    if (x >= max || x < 0 || y >= max || y < 0) {
        return callback(new Error('Coordinates out of range: %d/%d/%d', z, x, y));
    } else if (!this._mml || !this._mml.interactivity) {
        return callback(new Error('Tileset has no interactivity'));
    } else if (!mapnik.supports.grid) {
        return callback(new Error('Mapnik is missing grid support'));
    }

    var key = ['utf', z, x, y].join(',');
    this._tileCache.get(key, function(err, grid, headers) {
        if (err) return callback(err);
        callback(null, grid, headers);
    });
};

MapnikSource.prototype.getInfo = function(callback) {
    if (this._info) callback(null, this._info);
    else callback(new Error('Info is unavailable'));
};

// Add other functions.
require('./render');

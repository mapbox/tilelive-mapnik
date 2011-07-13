var fs = require('fs');
var crypto = require('crypto');
var Step = require('step');
var path = require('path');
var get = require('get');
var url = require('url');
var mapnik = require('mapnik');
var carto = require('carto');
var qs = require('querystring');
var Format = require('./format');
var Pool = require('generic-pool').Pool;
var LockingCache = require('./lockingcache');
var sm = new (require('sphericalmercator'));

var cache = {};

// @TODO: add grid support
// @TODO: add metatiling
// @TODO: add locking
// @TODO: refactor lib/format.js


module.exports = MapnikSource;
require('util').inherits(MapnikSource, require('events').EventEmitter);
function MapnikSource(uri, callback) {
    if (typeof uri === 'string') uri = url.parse(uri, true);
    var key = url.format(uri);

    if (uri.protocol && uri.protocol !== 'mapnik:') {
        throw new Error('Only the mapnik protocol is supported');
    }

    if (!cache[key]) {
        cache[key] = this;
        this._open(uri);
    }

    var source = cache[key];
    if (!source.open) {
        source.once('open', callback);
    } else {
        callback(null, source);
    }
    return undefined;
}


// Finds all mml files in the filepath and returns their tilesource URI.
MapnikSource.list = function(filepath, callback) {
    filepath = path.resolve(filepath);
    fs.readdir(filepath, function(err, files) {
        if (err) return callback(err);
        for (var result = {}, i = 0; i < files.length; i++) {
            var name = files[i].match(/^([\w-]+)\.mml$/);
            if (name) result[name[1]] = 'mapnik://' + path.join(filepath, name[0]);
        }
        return callback(null, result);
    });
};

// Finds an mml file with the given ID in the filepath and returns a
// tilesource URI.
MapnikSource.findID = function(filepath, id, callback) {
    filepath = path.resolve(filepath);
    var file = path.join(filepath, id + '.mml');
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

    uri.query = uri.query || {};
    if (typeof uri.query === 'string') {
        uri.query = qs.parse(uri.query);
    }

    this._data_dir = uri.query.data_dir || '';
    this._local_data_dir = uri.query.local_data_dir || '';

    if (uri.hostname === '.' || uri.hostname == '..') {
        uri.pathname = uri.hostname + uri.pathname;
        delete uri.hostname;
        delete uri.host;
    }

    this._uri = uri;

    // Initialize this map. This wraps `localize()` and calls `create()`
    // afterwards to actually create a new Mapnik map object.
    Step(function() {
        source._localize(this);
    }, function(err, compiled) {
        if (err) return error(err);
        source._createTileCache();
        source._createPool(compiled, this);
    }, function(err) {
        if (err) return error(err);
        source._populateInfo(this);
    }, function(err) {
        if (err) return error(err);

        source.open = true;
        source.emit('open', null, source);
    });
};

MapnikSource.registerProtocols = function(tilelive) {
    tilelive.protocols['mapnik:'] = MapnikSource;
};


// Compile the datasource info a Mapnik XML mapfile with its dependencies
// (shapefiles, etc.) all in place. Will download (for URLs) and render (for
// Carto MML) if necessary or pass through appropriately. Calls `callback`
// when the mapfile can be expected to be in `mapfile`. If this isn't
// successful, `callback` gets an error as its first argument.
MapnikSource.prototype._localize = function(callback) {
    var source = this;
    Step(function() {
        if (source._uri.hostname) {
            // This is a HTTP stylesheet. Load it from the web.
            new get(url.format(source._uri)).asString(this);
            if (!source._data_dir) source._data_dir = '/tmp/';
        } else if (source._uri.data) {
            // This is a literal stylesheet. We already have the data.
            this(null, JSON.stringify(source._uri.data));
            if (!source._data_dir) source._data_dir = '/tmp/';
        } else {
            // This is a file-based stylesheet. Load it from the file.
            fs.readFile(source._uri.pathname, 'utf8', this);
            source._local_data_dir = path.resolve(path.dirname(source._uri.pathname));
            if (!source._data_dir) source._data_dir = source._local_data_dir;
        }
    }, function(err, data) {
        if (err) return callback(err);

        try { data = JSON.parse(data); }
        catch (err) { return callback(err); }

        source._mml = data;

        if (true /* @TODO: Determine properly whether we need to render this */) {
            var renderer = new carto.Renderer({
                alias: true,
                data_dir: source._data_dir,
                local_data_dir: source._local_data_dir,
                validation_data: { fonts: mapnik.fonts() }
            });
            renderer.render(data, this);
        } else {
            this(null, data);
        }
    }, callback);
};

// Create a new mapnik map object at `this.mapnik`. Requires that the mapfile
// be localized with `this.localize()`. This can be called in repetition because
// it won't recreate `this.mapnik`.
MapnikSource.prototype._createPool = function(compiled, callback) {
    var source = this;
    if (!this._pool) this._pool = Pool({
        create: function(callback) {
            try {
                // @TODO: Do we need to configure the size?
                var map = new mapnik.Map(256, 256);
                map.fromStringSync(compiled, {
                    strict: true,
                    base: source._local_data_dir + '/'
                });
                map.zoomAll();
                map.bufferSize = 128;
            } catch (err) {
                delete map;
                callback(err);
                return;
            }
            callback(null, map);
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

    if (this._mml._center) {
        info.center = [ this._mml._center.lon, this._mml._center.lat, this._mml._center.zoom ];
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
MapnikSource.prototype._createTileCache = function() {
    var source = this;
    this._tileCache = new LockingCache(function(key) {
        var cache = this;
        var coords = key.split(',');

        source._pool.acquire(function(err, map) {
            if (err) return cache.put(key, err);

            Format.select('png')({
                bbox: sm.bbox(coords[1], coords[2], coords[0], false, '900913')
            }, map, function(err, tile) {
                source._pool.release(map);
                if (err) return cache.put(key, err);
                cache.put(key, null, tile);
            });
        });

        return [ key ];
    });
};

// Render handler for a given tile request.
MapnikSource.prototype.getTile = function(z, x, y, callback) {
    // @TODO: find a way to allow selecting a particular file format.
    var key = [z, x, y].join(',');
    this._tileCache.get(key, function(err, tile) {
        if (err) return callback(err);
        callback(null, tile[0], tile[1]);
    });
};

MapnikSource.prototype.getInfo = function(callback) {
    if (this._info) callback(null, this._info);
    else callback(new Error('Info is unavailable'));
};

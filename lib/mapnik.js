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

exports = module.exports = MapnikSource;

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
        source._createMetatileCache();
        source._createMetagridCache();
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

// Compile the datasource into a Mapnik XML mapfile with its dependencies
// (shapefiles, etc.) all in place. Will download (for URLs) and render (for
// Carto MML) if necessary or pass through appropriately. Calls `callback`
// when the mapfile can be expected to be in `mapfile`. If this isn't
// successful, `callback` gets an error as its first argument.
MapnikSource.prototype._localize = function(callback) {
    var source = this;
    Step(function() {
        if (source._uri.hostname) {
            // This is a HTTP stylesheet. Load it from the web.
            if (source._uri.protocol === 'mapnik:') source._uri.protocol = 'http:';
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

        // Migrate underscore properties to normal equivalents.
        ['_center', '_format', '_interactivity'].forEach(function(key) {
            if (!data[key]) return;
            data[key.substr(1)] = data[key.substr(1)] || data[key];
            delete data[key];
        });

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
    }, function(err, data) {
        // @TODO: Remove once this is fixed upstream in carto.
        // See https://github.com/mapbox/carto/issues/79.
        if (Array.isArray(err)) {
            err = err.shift();
            if (!(err instanceof Error)) {
                err = new Error(err.message + " at " + err.filename + ':' + (err.line + 1) + ':' + err.index);
            }
        }
        callback(err, data);
    });
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
                    strict: false,
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

// Interactivity: Convert teaser/full template markup into formatter js.
// Replaces tokens like `[NAME]` with string concatentations of `data.NAME`
// removes line breaks and escapes single quotes.
MapnikSource.prototype._formatterJS = function() {
    var full = this._mml.interactivity.template_full || '';
    var teaser = this._mml.interactivity.template_teaser || '';
    var location = this._mml.interactivity.template_location || '';
    full = full.replace(/\'/g, '\\\'').replace(/\[([\w\d\s]+)\]/g, "' + data[\"$1\"] + '").replace(/\n/g, ' ');
    teaser = teaser.replace(/\'/g, '\\\'').replace(/\[([\w\d\s]+)\]/g, "' + data[\"$1\"] + '").replace(/\n/g, ' ');
    location = location.replace(/\'/g, '\\\'').replace(/\[([\w\d\s]+)\]/g, "' + data[\"$1\"] + '").replace(/\n/g, ' ');
    return "function(options, data) { " +
               "switch (options.format) { " +
                   "case 'full': return '" + full + "'; break; " +
                   "case 'location': return '" + location + "'; break; " +
                   "case 'teaser': default: return '" + teaser + "'; break; " +
               "} " +
           "}";
},

MapnikSource.prototype._populateInfo = function(callback) {
    var source = this;
    var info = {
        name: path.basename(this._uri.pathname, path.extname(this._uri.pathname)),

        // We can't determine a sensible minzoom/maxzoom
        minzoom: 0,
        maxzoom: 22
    };

    info.id = info.name;

    if (this._mml.center) {
        info.center = [ this._mml.center.lon, this._mml.center.lat, this._mml.center.zoom ];
    }

    if (this._mml.interactivity) {
        info.formatter = this._formatterJS();
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
            metatile: 4,
            z: +coords[0],
            x: +coords[1],
            y: +coords[2]
        }, function(err, tiles) {
            if (err) {
                // Push error objects to all entries that were supposed to
                // be generated.
                keys.forEach(function(coords) {
                    cache.put(coords.join(','), err);
                });
            } else {
                // Put all the generated tiles into the locking cache.
                tiles.forEach(function(tile) {
                    var key = tile.z + ',' + tile.x + ',' + tile.y;
                    cache.put(key, null, tile.image, tile.headers);
                });
            }
        });

        // Return a list of all the tile coordinates that are being rendered
        // as part of this metatile.
        return keys.map(function(coords) { return coords.join(','); });
    });
};

// Creates a locking cache that generates tiles. When requesting the same tile
// multiple times, they'll be grouped to one request.
MapnikSource.prototype._createMetagridCache = function() {
    var source = this;
    this._gridCache = new LockingCache(function(key) {
        var cache = this;
        var coords = key.split(',');
        var keys = source._renderMetagrid({
            metatile: 4,
            z: +coords[0],
            x: +coords[1],
            y: +coords[2]
        }, function(err, grids) {
            if (err) {
                // Push error objects to all entries that were supposed to
                // be generated.
                keys.forEach(function(coords) {
                    cache.put(coords.join(','), err);
                });
            } else {
                // Put all the generated tiles into the locking cache.
                grids.forEach(function(grid) {
                    var key = grid.z + ',' + grid.x + ',' + grid.y;
                    cache.put(key, null, grid.image, grid.headers);
                });
            }
        });

        // Return a list of all the grid coordinates that are being rendered
        // as part of this metatile.
        return keys.map(function(coords) { return coords.join(','); });
    });
};

// Render handler for a given tile request.
MapnikSource.prototype.getTile = function(z, x, y, callback) {
    // @TODO: find a way to allow selecting a particular file format.
    var key = [z, x, y].join(',');
    this._tileCache.get(key, function(err, tile, headers) {
        if (err) return callback(err);
        callback(null, tile, headers);
    });
};

MapnikSource.prototype.getGrid = function(z, x, y, callback) {
    if (!this._mml || !this._mml.interactivity) {
        return callback(new Error('Tileset has no interactivity'));
    } else if (!mapnik.supports.grid) {
        return callback(new Error('Mapnik is missing grid support'));
    }

    var key = [z, x, y].join(',');
    this._gridCache.get(key, function(err, grid, headers) {
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

var mapnik = require('mapnik');
var _ = require('underscore');
var Step = require('step');
var mime = require('mime')

var MapnikSource = require('./mapnik_backend');

var EARTH_RADIUS = 6378137;
var EARTH_DIAMETER = EARTH_RADIUS * 2;
var EARTH_CIRCUMFERENCE = EARTH_DIAMETER * Math.PI;
var MAX_RES = EARTH_CIRCUMFERENCE / 256;
var ORIGIN_SHIFT = EARTH_CIRCUMFERENCE/2;


exports['calculateMetatile'] = calculateMetatile;
function calculateMetatile(options) {
    var z = +options.z, x = +options.x, y = +options.y;
    var total = 1 << z;
    var resolution = MAX_RES / total;

    // Make sure we start at a metatile boundary.
    x -= x % options.metatile;
    y -= y % options.metatile;

    // Make sure we don't calculcate a metatile that is larger than the bounds.
    var metaWidth  = Math.min(options.metatile, total, total - x);
    var metaHeight = Math.min(options.metatile, total, total - y);

    // Generate all tile coordinates that are within the metatile.
    var tiles = [];
    for (var dx = 0; dx < metaWidth; dx++) {
        for (var dy = 0; dy < metaHeight; dy++) {
            tiles.push([ z, x + dx, y + dy ]);
        }
    }

    var minx = (x * 256) * resolution - ORIGIN_SHIFT;
    var miny = -((y + metaHeight) * 256) * resolution + ORIGIN_SHIFT;
    var maxx = ((x + metaWidth) * 256) * resolution - ORIGIN_SHIFT;
    var maxy = -((y * 256) * resolution - ORIGIN_SHIFT);
    return {
        width: metaWidth * options.tileSize,
        height: metaHeight * options.tileSize,
        x: x, y: y,
        tiles: tiles,
        bbox: [ minx, miny, maxx, maxy ]
    };
}

exports['sliceMetatile'] = sliceMetatile;
function sliceMetatile(source, image, options, meta, callback) {
    var tiles = {};

    Step(function() {
        var group = this.group();
        meta.tiles.forEach(function(c) {
            var next = group();
            var key = [options.format, c[0], c[1], c[2]].join(',');
            getImage(source,
                     image,
                     options,
                     (c[1] - meta.x) * options.tileSize,
                     (c[2] - meta.y) * options.tileSize,
                     function(err, image) {
                tiles[key] = {
                    image: image,
                    headers: options.headers
                };
                next();
            });
        });
    }, function(err) {
        if (err) return callback(err);
        callback(null, tiles);
    });
}

exports['encodeSingleTile'] = encodeSingleTile;
function encodeSingleTile(source, image, options, meta, callback) {
    var tiles = {};
    var key = [options.format, options.z, options.x, options.y].join(',');
    getImage(source, image, options, 0, 0, function(err, image) {
        if (err) return callback(err);
        tiles[key] = { image: image, headers: options.headers };
        callback(null, tiles);
    });
}

function getImage(source, image, options, x, y, callback) {
    var view = image.view(x, y, options.tileSize, options.tileSize);
    view.isSolid(function(err, solid, pixel) {
        if (err) return callback(err);
        var pixel_key = '';
        if (solid) {
            if (options.format === 'utf') {
                // TODO https://github.com/mapbox/tilelive-mapnik/issues/56
                pixel_key = pixel.toString();
            } else {
                // https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Operators/Bitwise_Operators
                var a = (pixel>>>24) & 0xff;
                var r = pixel & 0xff;
                var g = (pixel>>>8) & 0xff;
                var b = (pixel>>>16) & 0xff;
                pixel_key = options.format + r +','+ g + ',' + b + ',' + a;
            }
        }
        // Add stats.
        options.source._stats.total++;
        if (solid !== false) options.source._stats.solid++;
        if (solid !== false && image.painted()) options.source._stats.solidPainted++;
        // If solid and image buffer is cached skip image encoding.
        if (solid && source.solidCache[pixel_key]) return callback(null, source.solidCache[pixel_key]);
        // Note: the second parameter is needed for grid encoding.
        options.source._stats.encoded++;
        try {
            view.encode(options.format, options, function(err, buffer) {
                if (err) {
                    return callback(err);
                }
                if (solid !== false) {
                    // @TODO for 'utf' this attaches an extra, bogus 'solid' key to
                    // to the grid as it is not a buffer but an actual JS object.
                    // Fix is to propagate a third parameter through callbacks all
                    // the way back to tilelive source #getGrid.
                    buffer.solid = pixel_key;
                    source.solidCache[pixel_key] = buffer;
                }
                return callback(null, buffer);
            });
        } catch (err) {
            return callback(err);
        }
    });
}

// Render png/jpg/tif image or a utf grid and return an encoded buffer
MapnikSource.prototype._renderMetatile = function(options, callback) {
    var source = this;

    // Calculate bbox from xyz, respecting metatile settings.
    var meta = calculateMetatile(options);

    // Set default options.
    if (options.format === 'utf') {
        options.layer = source._info.interactivity_layer;
        options.fields = source._info.interactivity_fields;
        options.resolution = source._uri.query.resolution;
        options.headers = { 'Content-Type': 'text/javascript; charset=utf-8' };
        var image = new mapnik.Grid(meta.width, meta.height);
    } else {
        // NOTE: formats use mapnik syntax like `png8:m=h` or `jpeg80`
        // so we need custom handling for png/jpeg
        if (options.format.indexOf('png') != -1) {
            options.headers = { 'Content-Type': 'image/png' };
        } else if (options.format.indexOf('jpeg') != -1 ||
                   options.format.indexOf('jpg') != -1) {
            options.headers = { 'Content-Type': 'image/jpeg' };
        } else {
            // will default to 'application/octet-stream' if unable to detect
            options.headers = { 'Content-Type': mime.lookup(options.format.split(':')[0]) };
        }
        var image = new mapnik.Image(meta.width, meta.height);
    }

    options.scale = +source._uri.query.scale;

    // Add reference to the source allowing debug/stat reporting to be compiled.
    options.source = source;

    process.nextTick(function() {
        // acquire can throw if pool is draining
        try {
            source._pool.acquire(function(err, map) {
                if (err) {
                    return callback(err);
                }
                // Begin at metatile boundary.
                options.x = meta.x;
                options.y = meta.y;
                map.resize(meta.width, meta.height);
                map.extent = meta.bbox;
                // todo - handle per tile bufferSize: https://github.com/mapnik/node-mapnik/issues/175
                try {
                    source._stats.render++;
                    map.render(image, options, function(err, image) {
                        process.nextTick(function() {
                            // Release after the .render() callback returned
                            // to avoid mapnik errors.
                            source._pool.release(map);
                        });
                        if (err) return callback(err);
                        if (meta.tiles.length > 1) {
                            sliceMetatile(source, image, options, meta, callback);
                        } else {
                            encodeSingleTile(source, image, options, meta, callback);
                        }
                    });
                } catch(err) {
                    process.nextTick(function() {
                        // Release after the .render() callback returned
                        // to avoid mapnik errors.
                        source._pool.release(map);
                    });
                    return callback(err);
                }
            });
        } catch (err) {
            return callback(err);
        }
    });

    // Return a list of all the tile coordinates that are being rendered
    // as part of this metatile.
    return meta.tiles.map(function(tile) {
        return options.format + ',' + tile.join(',');
    });
};

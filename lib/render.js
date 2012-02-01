var mapnik = require('mapnik');
var _ = require('underscore');
var Step = require('step');

var MapnikSource = require('./mapnik');
var solidCache = {};

var EARTH_RADIUS = 6378137;
var EARTH_DIAMETER = EARTH_RADIUS * Math.PI;
var EARTH_CIRCUMFERENCE = EARTH_DIAMETER * 2;
var MAX_RES = EARTH_CIRCUMFERENCE / 256;

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

    var minx = (x * 256) * resolution - EARTH_DIAMETER;
    var miny = -((y + metaHeight) * 256) * resolution + EARTH_DIAMETER;
    var maxx = ((x + metaWidth) * 256) * resolution - EARTH_DIAMETER;
    var maxy = -((y * 256) * resolution - EARTH_DIAMETER);
    return {
        width: metaWidth * 256,
        height: metaHeight * 256,
        x: x, y: y,
        tiles: tiles,
        bbox: [ minx, miny, maxx, maxy ]
    };
}

exports['sliceMetatile'] = sliceMetatile;
function sliceMetatile(image, options, meta, callback) {
    var tiles = {};

    Step(function() {
        var group = this.group();
        meta.tiles.forEach(function(c) {
            var next = group();
            var key = [options.format, c[0], c[1], c[2]].join(',');
            getImage(image, options, (c[1] - meta.x) * 256, (c[2] - meta.y) * 256, function(err, image) {
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
function encodeSingleTile(image, options, meta, callback) {
    var tiles = {};
    var key = [options.format, options.z, options.x, options.y].join(',');
    getImage(image, options, 0, 0, function(err, image) {
        if (err) return callback(err);
        tiles[key] = { image: image, headers: options.headers };
        callback(null, tiles);
    });
}

function getImage(image, options, x, y, callback) {
    var view = image.view(x, y, 256, 256);
    var solid = view.isSolid() &&
        (function(p) {
            if (options.format === 'utf') return p.toString();
            else return p.r +','+ p.g + ',' + p.b + ',' + p.a;
        })(view.getPixel(0,0));

    // Add stats.
    options.source._stats.total++;
    if (solid !== false) options.source._stats.solid++;
    if (solid !== false && image.painted()) options.source._stats.solidPainted++;

    // If solid and image buffer is cached skip image encoding.
    if (solid && solidCache[solid]) return callback(null, solidCache[solid]);

    // Note: the second parameter is needed for grid encoding.
    options.source._stats.encoded++;
    view.encode(options.format, options, function(err, buffer) {
        if (err) return callback(err);
        if (solid !== false) {
            // @TODO for 'utf' this attaches an extra, bogus 'solid' key to
            // to the grid as it is not a buffer but an actual JS object.
            // Fix is to propagate a third parameter through callbacks all
            // the way back to tilelive source #getGrid.
            buffer.solid = solid;
            solidCache[solid] = buffer;
        }
        return callback(null, buffer);
    });
}

// Render png/jpg image or a utf grid and return an encoded buffer
MapnikSource.prototype._renderMetatile = function(options, callback) {
    var source = this;

    // Calculate bbox from xyz, respecting metatile settings.
    var meta = calculateMetatile(options);

    // Set default options.
    if (options.format === 'utf') {
        var interactivity = source._mml.interactivity;
        options.layer = interactivity.layer;
        options.fields = interactivity.fields;
        options.resolution = source._uri.query.resolution;
        options.headers = { 'Content-Type': 'text/javascript; charset=utf-8' };
        var image = new mapnik.Grid(meta.width, meta.height);
    } else {
        options.headers = { 'Content-Type': 'image/png' };
        var image = new mapnik.Image(meta.width, meta.height);
    }

    // Add reference to the source allowing debug/stat reporting to be compiled.
    options.source = source;

    process.nextTick(function() {
        source._pool.acquire(function(err, map) {
            if (err) return callback(err);

            // Begin at metatile boundary.
            options.x = meta.x;
            options.y = meta.y;

            map.resize(meta.width, meta.height);
            map.extent = meta.bbox;

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
                        sliceMetatile(image, options, meta, callback);
                    } else {
                        encodeSingleTile(image, options, meta, callback);
                    }
                });
            } catch(err) {
                source._pool.release(map);
                callback(err);
            }
        });
    });

    // Return a list of all the tile coordinates that are being rendered
    // as part of this metatile.
    return meta.tiles.map(function(tile) {
        return options.format + ',' + tile.join(',');
    });
};

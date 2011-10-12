var mapnik = require('mapnik');
var _ = require('underscore');
var Step = require('step');

var MapnikSource = require('./mapnik');

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
            var view = image.view((c[1] - meta.x) * 256, (c[2] - meta.y) * 256, 256, 256);
            var key = [options.format, c[0], c[1], c[2]].join(',');

            // Note: the second parameter is needed for grid encoding.
            view.encode(options.format, options, function(err, image) {
                if (!err) {
                    tiles[key] = {
                        image: image,
                        headers: options.headers
                    };
                }
                next(err);
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
    image.encode(options.format, options, function(err, image) {
        if (err) return callback(err);
        tiles[key] = { image: image, headers: options.headers };
        callback(null, tiles);
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

    process.nextTick(function() {
        source._pool.acquire(function(err, map) {
            if (err) return callback(err);

            // Begin at metatile boundary.
            options.x = meta.x;
            options.y = meta.y;

            map.resize(meta.width, meta.height);
            map.extent = meta.bbox;

            try {
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

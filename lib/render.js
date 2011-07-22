var mapnik = require('mapnik');
var _ = require('underscore');

var MapnikSource = require('./mapnik');

var EARTH_RADIUS = 6378137;
var EARTH_DIAMETER = EARTH_RADIUS * Math.PI;
var EARTH_CIRCUMFERENCE = EARTH_DIAMETER * 2;
var MAX_RES = EARTH_CIRCUMFERENCE / 256;

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
};

function sliceMetatile(image, options, meta) {
    return meta.tiles.map(function(c) {
        var view = image.view((c[1] - meta.x) * 256, (c[2] - meta.y) * 256, 256, 256);
        return {
            // Note: the second parameter is needed for grid encoding.
            image: view.encode(options.format, options),
            z: c[0], x: c[1], y: c[2],
            headers: options.headers
        };
    });
}

function extractFields() {
    // Determine fields that need to be included from templates.
    // @TODO allow non-templated fields to be included.
    var functions = Array.prototype.slice.call(arguments);
    fields = functions.join(' ').match(/\[([\w\d]+)\]/g);
    return _(fields).chain()
        .filter(_.isString)
        .map(function(field) { return field.replace(/[\[|\]]/g, ''); })
        .push('__id__')
        .uniq()
        .value();
};

// Render png/jpg image and return an encoded buffer
MapnikSource.prototype._renderMetatile = function(options, callback) {
    var source = this;

    // Set default options.
    options.format = (options.format === 'png8') ? 'png8' : 'png';
    options.headers = { 'Content-Type': 'image/png' };

    // Calculate bbox from xyz, respecting metatile settings.
    var meta = calculateMetatile(options);
    var image = new mapnik.Image(meta.width, meta.height);

    source._pool.acquire(function(err, map) {
        if (err) return callback(err);

        // Begin at metatile boundary.
        options.x = meta.x;
        options.y = meta.y;

        map.resize(meta.width, meta.height);
        map.extent = meta.bbox;
        map.render(image, options, function(err, image) {
            source._pool.release(map);
            if (err) return callback(err);

            if (meta.tiles.length > 1) {
                var tiles = sliceMetatile(image, options, meta);
            } else {
                var tiles = [{
                    image: image.encode(options.format),
                    z: options.z, x: options.x, y: options.y,
                    headers: options.headers
                }];
            }

            callback(null, tiles);
        });
    });

    // Return a list of all the tile coordinates that are being rendered
    // as part of this metatile.
    return meta.tiles;
};

MapnikSource.prototype._renderMetagrid = function(options, callback) {
    var source = this;

    var interactivity = source._mml.interactivity;
    options.layer = interactivity.layer;
    options.fields = extractFields(interactivity.template_full,
            interactivity.template_teaser, interactivity.template_location);
    options.resolution = 4;
    options.format = 'utf';
    options.headers = { 'Content-Type': 'text/javascript; charset=utf-8' };


    // Calculate bbox from xyz, respecting metatile settings.
    var meta = calculateMetatile(options);
    var grid = new mapnik.Grid(meta.width, meta.height);

    source._pool.acquire(function(err, map) {
        if (err) return callback(err);

        // Begin at metatile boundary.
        options.x = meta.x;
        options.y = meta.y;

        map.resize(meta.width, meta.height);
        map.extent = meta.bbox;
        map.render(grid, options, function(err, grid) {
            source._pool.release(map);
            if (err) return callback(err);

            if (meta.tiles.length > 1) {
                var grids = sliceMetatile(grid, options, meta);
            } else {
                var grids = [{
                    image: grid.encode(options.format, options),
                    z: options.z, x: options.x, y: options.y,
                    headers: options.headers
                }];
            }

            callback(null, grids);
        });
    });

    // Return a list of all the tile coordinates that are being rendered
    // as part of this metatile.
    return meta.tiles;
};

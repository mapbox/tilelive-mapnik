// Mapnik options formats. Each format should provide a `render()` method and a
// regex at `find` that can be used to select the format for use with a given
// options request. `render(options, map, callback)` takes the following arguments:
//
// - `options` options to be rendered.
// - `map` an instantiated `node-mapnik` `Map` object. Will have the map XML
//   for the given options request already loaded.
// - `callback` callback function to call once rendering is complete.
var Buffer = require('buffer').Buffer,
    path = require('path'),
    Step = require('step'),
    fs = require('fs');

try { var mapnik = require('mapnik'); } catch (e) {}

// Calculate the spherical mercator bounds for a given x,y,z
// that is sensitive to metatile size (which varies by zoom)
var xyz_to_meta_bbox = function(options) {
    // TODO - consider moving this to spherical mercator class
    var size = 256;
    var radius = 6378137;
    var diameter = radius * Math.PI;
    var circumferance = diameter * 2;
    var max_res = circumferance / size;
    var resolution = 0;
    var metasize = 1;
    var x = options.x;
    var y = options.y;

    // if (options.z > 0)
        resolution = max_res / Math.pow(2, options.z);

    if (options.metatile > 1) {
        x = options.x & ~(options.metatile - 1);
        y = options.y & ~(options.metatile - 1);
        metasize = Math.min(options.metatile, 1 << options.z);
    }

    var minx = (x * size) * resolution - diameter;
    var miny = -(((y + metasize) * size) * resolution - diameter);
    var maxx = ((x + metasize) * size) * resolution - diameter;
    var maxy = -((y * size) * resolution - diameter);

    return [minx, miny, maxx, maxy];
};

var Format = {
    // Select a format. Returns the renderer function of the matching format.
    // - `format` {String} format the extension of the options request
    select: function(format) {
        for (i in Format) {
            // don't consider this function
            if (Format[i].hasOwnProperty('find')) {
                if (format.match(Format[i].find)) {
                    return Format[i].render;
                }
            }
        }
    },

    // UTF8-grid format.
    grid: {
        'render': function(options, map, callback) {
            if (!mapnik.supports.grid) {
                return callback(new Error('Mapnik is missing grid support.'));
            }
            // node-mapnik latest defaults to
            // key:"__id__", resolution:4,fields:[]
            // but specify here for clarity and backwards compatibility
            options.fields = options.fields || [];
            options.key = options.key || options.key_name || '__id__';
            options.resolution = options.resolution || 4;
            // this is an override to be able to pass the right argument to mapnik
            // grid.json -> utf
            options.format = 'utf';
            options.content_type = {'Content-Type': 'text/javascript; charset=utf-8'};

            var grid;
            if (options.metatile > 1) {
                var render_size = 256 * options.metasize;
                map.resize(render_size, render_size);
                grid = new mapnik.Grid(render_size, render_size, {key: options.key});
                map.extent = xyz_to_meta_bbox(options);
            } else {
                map.resize(256 / options.resolution, 256 / options.resolution);
                grid = new mapnik.Grid(256, 256, {key: options.key});
                map.extent = options.bbox;
            }
            try {
                map.render(grid, options, function(err, grid) {
                    if (err) return callback(err, null);
                    if (options.metatile > 1) {
                        split_meta(grid, options, callback);
                    } else {
                        callback(null, [
                            grid.encode('utf', options),
                            options.content_type
                        ]);
                    }
                });
            } catch (err) {
                callback(err);
            }
        },
        'find': /grid\.json/
    }
};

module.exports = Format;

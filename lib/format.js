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
    fs = require('fs');

try { var mapnik = require('mapnik'); } catch (e) {}

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

    // PNG format.
    png: {
        'render': function(options, map, callback) {
            var format = (options.format === 'png8') ? 'png8' : 'png';
            var im = new mapnik.Image(map.width,map.height);
            map.extent = options.bbox;
            map.render(im, options, function(err, im) {
                if (err) return callback(err, null);
                callback(null, [
                    im.encode(options.format),
                    {'Content-Type': 'image/png'}
                ]);
            });
        },
        'find': /png/
    },

    // PDF format. Renders PDF to disk and then reads the file back into a
    // buffer to pass to the callback. @TODO:
    // - uses `map.render_to_file()` which is a blocking call. Update to async
    //   once supported by `node-mapnik`.
    // - skip writing to disk once possible to render to string in
    //   `node-mapnik`.
    pdf: {
        'render': function(options, map, callback) {
            var date = +new Date();
            var hash = 'pdf-' + date + '.pdf';
            var filepath = path.join('/tmp', hash);

            map.zoom_to_box(options.bbox);
            map.render_to_file(filepath, { format: 'pdf' });
            fs.readFile(filepath, 'binary', function(err, buffer) {
                fs.unlink(filepath, function(err) {
                    callback(null, [
                        buffer,
                        {'Content-Type': 'application/pdf'}
                    ]);
                });
            });
        },
        'find': /pdf/
    },

    // JPEG format.
    jpg: {
        'render': function(options, map, callback) {
            var format = options.format.match(/(jpg|jpeg)[\d]{0,2}/)
                ? options.format.replace('jpg', 'jpeg')
                : 'jpeg';
            var im = new mapnik.Image(map.width,map.height);
            map.extent = options.bbox;
            map.render(im, options, function(err, im) {
                if (err) return callback(err, null);
                callback(null, [
                    im.encode(options.format),
                    {'Content-Type': 'image/jpeg'}
                ]);
            });
        },
        'find': /jpg|jpeg/
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
            options.key = options.key || options.key_name || "__id__";
            options.resolution = options.resolution || 4;
            var grid = new mapnik.Grid(map.width,map.height, {key:options.key} );
            map.extent = options.bbox;
            try {
                map.render(grid, options, function(err, grid) {
                    if (err) return callback(err, null);
                    callback(null, [
                        grid.encode('utf',options),
                        {'Content-Type': 'text/javascript; charset=utf-8'}
                    ]);
                });
            } catch (err) {
                callback(err);
            }
        },
        'find': /grid\.json/
    }
};

module.exports = Format;

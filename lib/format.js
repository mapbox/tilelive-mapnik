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

    if (options.z > 0)
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

// Slice up a metatile into its component tiles using mapnik
// views which allow subsetting to be done without any internal
// copying of the image data.
// This will return an array of tiles with new xyz info for each
// of the 256x256 tiles split from the original, single, metatile
var split_meta = function(im,options,callback) {
    Step(
      function() {
          var group = this.group();
          for (var xx = 0; xx < options.metasize; xx++) {
              for (var yy = 0; yy < options.metasize; yy++) {
                  var next = group();
                  var yy1 = yy + (options.y & ~(options.metatile - 1));
                  // var yy2 = (Math.pow(2, options.z) - 1) - yy1;
                  var meta = { z: options.z, x: options.x + xx, y: yy1 };
                  var view = im.view(xx * 256 , yy * 256, 256, 256);
                  var response = [view.encode(options.format, options), options.content_type, meta];
                  next(null, response);
              }
          }
      },
      function(err, tiles) {
          if (err) throw err;
          callback(null, tiles);
      }
    );
};

// Render png/jpg image and return an encoded buffer
var render_image = function(map,options,callback) {
      var im;
      if (options.metatile > 1) {
          var render_size = 256 * options.metasize;
          map.resize(render_size, render_size);
          im = new mapnik.Image(render_size, render_size);
          map.extent = xyz_to_meta_bbox(options);
      } else {
          im = new mapnik.Image(map.width, map.height);
          map.extent = options.bbox;
      }
      map.render(im, options, function(err, im) {
          if (err) return callback(err, null);
          if (options.metatile > 1) {
              split_meta(im, options, callback);
          } else {
              callback(null, [
                  im.encode(options.format),
                  options.content_type
              ]);
          }
      });
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

    // PNG format.
    png: {
        'render': function(options, map, callback) {
            options.format = (options.format === 'png8') ? 'png8' : 'png';
            options.content_type = {'Content-Type': 'image/png'};
            render_image(map, options, callback);
        },
        'find': /png/
    },

    // JPEG format.
    jpg: {
        'render': function(options, map, callback) {
            options.format = options.format.match(/(jpg|jpeg)[\d]{0,2}/)
                ? options.format.replace('jpg', 'jpeg')
                : 'jpeg';
            options.content_type = {'Content-Type': 'image/jpeg'};
            render_image(map, options, callback);
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
                grid = new mapnik.Grid(map.width, map.height, {key: options.key});
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
    },

    // PDF format. Renders PDF to disk and then reads the file back into a
    // buffer to pass to the callback. @TODO:
    // - uses `map.renderFileSync()` which is a blocking call. Update to async
    //   once supported by `node-mapnik`.
    // - skip writing to disk once possible to render to string in
    //   `node-mapnik`.
    pdf: {
        'render': function(options, map, callback) {
            if (options.metatile > 1) {
                return callback(new Error('PDF rendering does not support metatiling'));
            }
            var date = +new Date();
            var hash = 'pdf-' + date + '.pdf';
            var filepath = path.join('/tmp', hash);

            map.extent = options.bbox;
            map.renderFileSync(filepath, { format: 'pdf' });
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
    }
};

module.exports = Format;

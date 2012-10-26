var mapnik = require('mapnik');
var _ = require('underscore');
var Step = require('step');
var Pool = require('generic-pool').Pool;

var MapnikSource = require('./mapnik_backend');
var solidCache = {};

var EARTH_RADIUS = 6378137;
var EARTH_DIAMETER = EARTH_RADIUS * 2;
var EARTH_CIRCUMFERENCE = EARTH_DIAMETER * Math.PI;
var MAX_RES = EARTH_CIRCUMFERENCE / 256;
var ORIGIN_SHIFT = EARTH_CIRCUMFERENCE/2;

var image_pools = function(size) {
    return {
        max: size || 5,
        pools: {},
        acquire: function(id, options, callback) {
            if (!this.pools[id]) {
                var that = this;
                this.pools[id] = Pool({
                    name: id,
                    create: function(cb) { cb(null,new mapnik.Image(id,id)) },
                    destroy: function(obj) { delete obj },
                    max: that.max,
                    idleTimeoutMillis: options.idleTimeoutMillis || 5000,
                    log: false
                    //reapIntervalMillis
                    //priorityRange
                });
            }
            this.pools[id].acquire(callback, options.priority || 0);
        },
        release: function(id, obj) {
            var p = this.pools[id];
            if (p) {
                p.release(obj);
                /*if (p.waitingClientsCount() > 0) {
                    console.log(id + ': pool size: ' + p.getPoolSize());
                    console.log(id + ': available: ' + p.availableObjectsCount());
                    console.log(id + ': waiting  : ' + p.waitingClientsCount());
                }*/
                // todo - cleanup unused pool for a given id
            }
        },
        drain: function() {
            for (obj in this.pools) {
                var p = this.pools[obj];
                p.drain(function () {
                    p.destroyAllNow(function() {
                    });
                });
            };
        }
    };
};

var images = image_pools(require('os').cpus().length * 2);

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
function sliceMetatile(image, options, meta, callback) {
    var tiles = {};

    Step(function() {
        var group = this.group();
        meta.tiles.forEach(function(c) {
            var next = group();
            var key = [options.format, c[0], c[1], c[2]].join(',');
            getImage(image, options, (c[1] - meta.x) * options.tileSize, (c[2] - meta.y) * options.tileSize, function(err, image) {
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
    var view = image.view(x, y, options.tileSize, options.tileSize);
    view.isSolid(function(err, solid, pixel) {
        if (err) return callback(err);
        var pixel_key = '';
        if (solid) {
            if (options.format === 'utf') {
                pixel_key = pixel.toString();
            } else {
                // https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Operators/Bitwise_Operators
                var a = (pixel>>>24) & 0xff;
                var r = pixel & 0xff;
                var g = (pixel>>>8) & 0xff;
                var b = (pixel>>>16) & 0xff;
                pixel_key = r +','+ g + ',' + b + ',' + a;
            }
        }

        // Add stats.
        options.source._stats.total++;
        if (solid !== false) options.source._stats.solid++;
        if (solid !== false && image.painted()) options.source._stats.solidPainted++;

        // If solid and image buffer is cached skip image encoding.
        if (solid && solidCache[pixel_key]) return callback(null, solidCache[pixel_key]);

        // Note: the second parameter is needed for grid encoding.
        options.source._stats.encoded++;
        view.encode(options.format, options, function(err, buffer) {
            if (err) return callback(err);
            if (solid !== false) {
                // @TODO for 'utf' this attaches an extra, bogus 'solid' key to
                // to the grid as it is not a buffer but an actual JS object.
                // Fix is to propagate a third parameter through callbacks all
                // the way back to tilelive source #getGrid.
                buffer.solid = pixel_key;
                solidCache[pixel_key] = buffer;
            }
            return callback(null, buffer);
        });
    });
}

// Render png/jpg image or a utf grid and return an encoded buffer
MapnikSource.prototype._renderMetatile = function(options, callback) {
    var source = this;

    // Calculate bbox from xyz, respecting metatile settings.
    var meta = calculateMetatile(options);
    options.scale = source._uri.query.scale;
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

            // Set default options.
            if (options.format === 'utf') {
                options.layer = source._info.interactivity_layer;
                options.fields = source._info.interactivity_fields;
                options.resolution = source._uri.query.resolution;
                options.headers = { 'Content-Type': 'text/javascript; charset=utf-8' };
                var image = new mapnik.Grid(meta.width, meta.height);
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

            } else {
                options.headers = { 'Content-Type': 'image/png' };
                if (options.format.indexOf('jpeg') != -1) {
                    options.headers = { 'Content-Type': 'image/jpeg' };
                }
                images.acquire(meta.width,{},function(err,image) {
                    if (err) {
                        images.release(meta.width,image);
                        return callback(err);
                    }
                    if (image.reused) {
                        image.clear();
                    }
                    image.reused = true;
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
                                sliceMetatile(image, options, meta, function(err,tiles) {
                                    images.release(meta.width,image);
                                    callback(err,tiles);
                                });
                            } else {
                                encodeSingleTile(image, options, meta, function(err,tiles) {
                                    images.release(meta.width,image);
                                    callback(err,tiles);
                                });
                            }
                        });
                    } catch(err) {
                        source._pool.release(map);
                        images.release(meta.width,image);
                        callback(err);
                    }
                });
            }
        });
    });

    // Return a list of all the tile coordinates that are being rendered
    // as part of this metatile.
    return meta.tiles.map(function(tile) {
        return options.format + ',' + tile.join(',');
    });
};

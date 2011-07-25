var _ = require('underscore');
var fs = require('fs');
var srs = require('srs');
var get = require('get');
var path = require('path');
var zipfile = require('zipfile');
var Step = require('step');
var url = require('url');
var crypto = require('crypto');

// https://gist.github.com/707661
function mkdirP(p, mode, f) {
    var cb = f || function() {};
    if (p.charAt(0) != '/') {
        cb(new Error('Relative path: ' + p));
        return;
    }

    var ps = path.normalize(p).split('/');
    path.exists(p, function(exists) {
        if (exists) cb(null);
        else mkdirP(ps.slice(0, -1).join('/'), mode, function(err) {
            if (err && err.code !== 'EEXIST') cb(err);
            else {
                fs.mkdir(p, mode, cb);
            }
        });
    });
};

function md5(data) {
    return crypto.createHash('md5').update(data).digest('hex');
};

// Unzip function, geared specifically toward unpacking a shapefile.
function unzip(file, callback) {
    try {
        var zf = new zipfile.ZipFile(file);
    } catch (err) {
        return callback(err);
    }

    var remaining = zf.names.length;
    var shp = _(zf.names).chain()
        .map(function(name) {
            if (path.extname(name).toLowerCase() !== '.shp') return;
            return path.join(
                path.dirname(file),
                path.basename(file, path.extname(file)) +
                path.extname(name).toLowerCase()
            );
        })
        .compact()
        .first()
        .value();
    if (!shp) return callback(new Error('Shapefile not found in zip ' + file));

    zf.names.forEach(function(name) {
        // Skip directories, hiddens.
        if (!path.extname(name) || name[0] === '.') {
            remaining--;
            if (!remaining) callback(null, shp);
        }
        // We're brutal in our expectations -- don't support nested
        // directories, and rename any file from `arbitraryName.SHP`
        // to `[hash].shp`.
        var dest = path.join(
            path.dirname(file),
            path.basename(file, path.extname(file)) +
            path.extname(name).toLowerCase()
        );
        zf.readFile(name, function(err, buff) {
            if (err) return callback(err);
            fs.open(dest, 'w', 0755, function(err, fd) {
                if (err) return callback(err);
                fs.write(fd, buff, 0, buff.length, null, function(err) {
                    if (err) return callback(err);
                    fs.close(fd, function(err) {
                        if (err) return callback(err);
                        remaining--;
                        if (!remaining) callback(null, shp);
                    });
                });
            });
        });
    });
};

module.exports = function resolve(options, callback) {
    if (!options) return callback(new Error('options is required.'));
    if (!options.mml) return callback(new Error('options.mml is required.'));
    if (!options.base) return callback(new Error('options.base is required.'));
    if (!options.cache) return callback(new Error('options.cache is required.'));
    var mml = options.mml;
    var base = path.resolve(options.base);
    var cache = path.resolve(options.cache);
    var resolved = JSON.parse(JSON.stringify(mml));

    Step(function setup() {
        mkdirP(path.join(base, 'layers'), 0755, this);
    }, function externals(err) {
        if (err) throw err;

        var remaining = mml.Layer.length + mml.Stylesheet.length;
        var error = null;
        var next = function(err) {
            remaining--;
            if (err) error = err;
            if (!remaining) this(error);
        }.bind(this);

        resolved.Stylesheet.forEach(function(s, index) {
            if (typeof s !== 'string') return;
            var uri = url.parse(s);

            // URL, download.
            if (uri.protocol) return (new get(s)).asString(function(err, data) {
                resolved.Stylesheet[index] = {id:s, data:data};
                next(err);
            });

            // File, read from disk.
            if (uri.pathname[0] !== '/')
                uri.pathname = path.join(base, uri.pathname);
            fs.readFile(uri.pathname, 'utf8', function(err, data) {
                resolved.Stylesheet[index] = {id:s, data:data};
                next(err);
            });
        });

        resolved.Layer.forEach(function(l, index) {
            if (!l.Datasource || !l.Datasource.file) return;
            var name = l.name || 'layer-' + index;
            var uri = url.parse(l.Datasource.file);
            var extname = path.extname(uri.pathname);
            var symlink = function(err, file) {
                if (err) return next(err);
                if (!file) return next();

                switch (extname.toLowerCase()) {
                // Unzip and symlink to directory.
                case '.zip':
                    l.Datasource.file =
                        path.join(base, 'layers', name, path.basename(file, path.extname(file)) + '.shp');
                    path.exists(path.dirname(l.Datasource.file), function(exists) {
                        if (exists) return next();
                        unzip(file, function(err, file) {
                            if (err) return next(err);
                            fs.symlink(path.dirname(file), path.dirname(l.Datasource.file), next);
                        });
                    });
                    break;
                // Symlink directories
                case '.shp':
                    l.Datasource.file =
                        path.join(base, 'layers', name, path.basename(file));
                    path.exists(path.dirname(l.Datasource.file), function(exists) {
                        if (exists) return next();
                        fs.symlink(path.dirname(file), path.dirname(l.Datasource.file), next);
                    });
                    break;
                // Symlink files
                default:
                    l.Datasource.file =
                        path.join(base, 'layers', name, name + extname);
                    path.exists(l.Datasource.file, function(exists) {
                        if (exists) return next();
                        fs.symlink(file, l.Datasource.file, next);
                    });
                    break;
                }
            };

            // URL.
            if (uri.protocol) {
                var hash = md5(l.Datasource.file).substr(0,8);
                var cachePath = _(['.shp', '.zip']).include(extname.toLowerCase())
                    ? path.join(cache, hash, hash + extname)
                    : path.join(cache, hash + extname);
                path.exists(cachePath, function(exists) {
                    if (exists) return symlink(null, cachePath);
                    mkdirP(path.dirname(cachePath), 0755, function(err) {
                        if (err) return symlink(err);
                        (new get(l.Datasource.file)).toDisk(cachePath, symlink);
                    });
                });
            // Absolute path.
            } else if (uri.pathname && uri.pathname[0] === '/') {
                symlink(null, uri.pathname);
            // Local path.
            } else {
                symlink();
            }
        });
    }, function autodetect(err) {
        if (err) throw err;

        var group = this.group();
        resolved.Layer.forEach(function(l) {
            var d = l.Datasource;
            switch (path.extname(d.file)) {
            case '.shp':
            case '.zip':
                d.type = d.type || 'shape';
                break;
            case '.geotiff':
            case '.geotif':
            case '.vrt':
            case '.tiff':
            case '.tif':
                d.type = d.type || 'gdal';
                // @TODO enforce 900913 for rasters here?
                break;
            case '.rss':
                d.type = d.type || 'ogr';
                d.layer_by_index = 0;
                break;
            }

            if (d.type !== 'shape' || l.srs) return;

            var next = group();
            var prj = path.join(
                path.dirname(d.file),
                path.basename(d.file, path.extname(d.file)) + '.prj'
            );
            fs.readFile(prj, 'utf8', function(err, data) {
                if (err) return next(err);
                try {
                    l.srs = l.srs || srs.parse(data).proj4;
                } catch (e) {}
                try {
                    l.srs = l.srs || srs.parse('ESRI::' + data).proj4;
                } catch (e) {}

                // Convert bad 900913 string to good.
                var normalized = _(l.srs.split(' ')).chain()
                    .select(function(s) { return s.indexOf('=') > 0 })
                    .sortBy(function(s) { return s })
                    .value()
                    .join(' ');
                var legacy = '+a=6378137 +b=6378137 +k=1.0 +lat_ts=0.0 +lon_0=0.0 +nadgrids=@null +proj=merc +units=m +x_0=0.0 +y_0=0';
                var updates = '+wktext +no_defs +over';
                if (normalized === legacy) l.srs = '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs +over';
                console.log('first');
                next(l.srs ? null : new Error('No projection found'));
            });
        });
    }, function end(err) {
        if (err) return callback(err);
        console.log(JSON.stringify(resolved,0,2));
        //console.warn(JSON.stringify(resolved,0,2));
        callback(null, resolved);
    });
};


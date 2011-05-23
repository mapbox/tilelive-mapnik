var fs = require('fs'),
    crypto = require('crypto'),
    EventEmitter = require('events').EventEmitter,
    Step = require('step'),
    Format = require('./format'),
    path = require('path'),
    s64 = require('./safe64'),
    sys = require('sys'),
    localized = {},
    locked = {},
    get = require('get'),
    mapnik = require('mapnik'),
    carto = require('carto');

// Map constructor
//
// - `datasource` {String, Object} URL location of the datasource.
// - `options` {Object} options
//   - `mapfile_dir` {String} path to where data files should be cached.
//   - `width` {Number} width of the map
//   - `height` {Number} height of the map
var Map = function(datasource, options) {
    options = options || {};
    this.datasource = datasource;
    this.options = options || {};
    this.language = options.language || this.dslanguage();
    this.options.width = options.width || 256;
    this.options.height = options.height || 256;
    this.mapfile_dir = options.mapfile_dir || '/tmp';

    if (this.dstype() === 'filename') {
        this.local_data_dir = path.dirname(this.datasource);
    } else {
        this.local_data_dir = '';
    }
};

// Find the mapfile on disk. If it's a URL, this will be
// the location of the downloaded Carto file. If it's a local path,
// this is the identity function.
//
// - @param {String} datasource.
// - @return {String} location.
Map.prototype.mapfile = function(callback) {
    switch (this.dstype()) {
    case 'url':
        return callback(null, this.mapfile_dir + '/' + s64.encode(this.datasource) + '.xml');
        break;
    case 'filename':
        if (this.language === 'xml') return callback(null, this.datasource);
        // If language is not XML, compilation is necessary. Append mtime
        // to ensure that compiled mapfile accurately reflects source.
        fs.stat(this.datasource, function(err, stat) {
            if (err) return callback(err);
            var mtime = (+stat.mtime).toString();
            return callback(null, this.mapfile_dir + '/' + s64.encode(this.datasource + mtime) + '.xml');
        }.bind(this));
        break;
    case 'literal':
        var hash = crypto
            .createHash('md5')
            .update(JSON.stringify(this.datasource))
            .digest('hex');
        return callback(null, this.mapfile_dir + '/' + hash + '.xml');
        break;
    }
};

// Determine the type of datasource passed. Returns either:
// - `url` an http or https url
// - `filename` a filepath
// - `literal` a literal map representation, either XML string or JSON MML.
Map.prototype.dstype = function() {
    if (typeof this.datasource === 'string') {
        if (this.datasource.match(/^http/)) {
            return 'url';
        } else if (this.datasource.match(/^<\?xml/)) {
            return 'literal';
        } else {
            return 'filename';
        }
    } else {
        return 'literal';
    }
};

// Determine the language of datasource passed. Returns either:
// - `xml` a mapnik XML file
// - `carto` a carto MML file
Map.prototype.dslanguage = function() {
    if (typeof this.datasource === 'string') {
        if (this.datasource.match(/xml$/) || this.datasource.match(/^<\?xml/)) {
            return 'xml';
        } else {
            return 'carto';
        }
    } else {
        return 'carto';
    }
};

// Initialize this map. This wraps `localize()` so that it isn't
// repetitively called, and it calls `create()` afterwards to actually
// create a new Mapnik map object if necessary.
Map.prototype.initialize = function(callback) {
    this.mapfile(function(err, p) {
        if (err) return callback(err);
        if (localized[p]) return this.create(p, callback);
        if (!locked[p]) {
            locked[p] = new EventEmitter();
            this.localize(p, function(err) {
                localized[p] = !err;
                locked[p].emit('unlock', err);
                delete locked[p];
            });
        }
        locked[p].once('unlock', function(err) {
            if (err) return callback(err);
            this.initialize(callback);
        }.bind(this));
    }.bind(this));
};

// Compile the datasource info a Mapnik XML mapfile with its dependencies
// (shapefiles, etc.) all in place. Will download (for URLs) and render (for
// Carto MML) if necessary or pass through appropriately. Calls `callback`
// when the mapfile can be expected to be in `mapfile`. If this isn't
// successful, `callback` gets an error as its first argument.
Map.prototype.localize = function(pos, callback) {
    var that = this;
    Step(
        function() {
            switch (that.dstype()) {
            case 'url':
                // As of node-get 0.1.0, exceptions are no longer thrown
                (new get(that.datasource)).asString(this);
                break;
            case 'filename':
                fs.readFile(that.datasource, 'utf8', this);
                break;
            case 'literal':
                // Clone literal object to prevent mangling.
                this(null, JSON.parse(JSON.stringify(that.datasource)));
                break;
            }
        },
        function(err, data) {
            if (err) return this(err);
            if (that.language === 'carto') {
                var renderer = new carto.Renderer({
                    data_dir: that.data_dir,
                    local_data_dir: that.local_data_dir,
                    validation_data: { fonts: mapnik.fonts() }
                });
                renderer.render(data, this);
            } else {
                this(null, data);
            }
        },
        function(err, compiled) {
            if (err) return this(err);
            fs.writeFile(pos, compiled, this);
        },
        function(err) {
            callback(err);
        }
    );
};

// Create a new mapnik map object at `this.mapnik`. Requires that the mapfile
// be localized with `this.localize()`. This can be called in repetition because
// it won't recreate `this.mapnik`.
Map.prototype.create = function(p, callback) {
    if (this.mapnik) return callback();

    this.mapnik = new mapnik.Map(
        this.options.width,
        this.options.height
    );

    try {
        this.mapnik.load(p);
        this.mapnik.buffer_size(128);
        callback();
    } catch (err) {
        callback(err);
    }
};

// Destroy this map's mapnik instance, first clearing out
// its references to datasources and then attempting to
// delete its memory.
Map.prototype.destroy = function() {
    if (!this.mapnik) return;
    this.mapnik.clear();
    delete this.mapnik;
};

// Render handler for a given tile request.
Map.prototype.render = function(tile, callback) {
    Format.select(tile.format)(tile, this.mapnik, callback);
};

module.exports = Map;

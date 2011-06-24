var fs = require('fs'),
    crypto = require('crypto'),
    EventEmitter = require('events').EventEmitter,
    Step = require('step'),
    Format = require('./format'),
    path = require('path'),
    s64 = require('./safe64'),
    get = require('get'),
    mapnik = require('mapnik'),
    carto = require('carto');

// Map constructor
//
// - `datasource` {String, Object} URL location of the datasource.
// - `options` {Object} options
//   - `width` {Number} width of the map
//   - `height` {Number} height of the map
//   - `data_dir` {String} path to where data files should be cached.
var Map = function(datasource, options) {
    options = options || {};
    this.datasource = datasource;
    this.language = options.language || this.dslanguage();
    this.width = options.width || 256;
    this.height = options.height || 256;
    if (this.dstype() === 'filename') {
        this.data_dir =
        this.local_data_dir = path.dirname(datasource);
    } else {
        this.data_dir = options.data_dir || '/tmp/';
        this.local_data_dir = options.local_data_dir || '';
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

// Initialize this map. This wraps `localize()` and calls `create()`
// afterwards to actually create a new Mapnik map object.
Map.prototype.initialize = function(callback) {
    this.localize(function(err, compiled) {
        if (err) return callback(err);
        this.create(compiled, callback);
    }.bind(this));
};

// Compile the datasource info a Mapnik XML mapfile with its dependencies
// (shapefiles, etc.) all in place. Will download (for URLs) and render (for
// Carto MML) if necessary or pass through appropriately. Calls `callback`
// when the mapfile can be expected to be in `mapfile`. If this isn't
// successful, `callback` gets an error as its first argument.
Map.prototype.localize = function(callback) {
    var that = this;
    Step(
        function() {
            fs.stat(that.datasource, this);
        },
        function(err, stat) {
            switch (that.dstype()) {
            case 'filename':
                if (!stat) throw new Error('Datasource not found');
                fs.readFile(that.datasource, 'utf8', this);
                break;
            case 'url':
                (new get(that.datasource)).asString(this);
                break;
            case 'literal':
                this(null, JSON.parse(JSON.stringify(that.datasource)));
                break;
            }
        },
        function(err, data) {
            if (err) throw err;
            if (that.language === 'carto') {
                var renderer = new carto.Renderer({
                    alias: true,
                    data_dir: that.data_dir,
                    local_data_dir: that.local_data_dir,
                    validation_data: { fonts: mapnik.fonts() }
                });
                renderer.render(data, this);
            } else {
                this(null, data);
            }
        },
        callback
    );
};

// Create a new mapnik map object at `this.mapnik`. Requires that the mapfile
// be localized with `this.localize()`. This can be called in repetition because
// it won't recreate `this.mapnik`.
Map.prototype.create = function(compiled, callback) {
    if (this.mapnik) return callback();
    this.mapnik = new mapnik.Map(this.width, this.height);
    try {
        this.mapnik.fromStringSync(compiled, { strict:true, base:this.local_data_dir + '/'});
        this.mapnik.bufferSize = 128;
        callback();
    } catch (err) {
        delete this.mapnik;
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

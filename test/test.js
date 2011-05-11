var mapnik = require('../index'),
    assert = require('assert'),
    fs = require('fs');

var OPTIONS = {
    bbox: [-20037508.34, -20037508.34, 20037508.34, 20037508.34],
    format: 'png'
};
var CARTOURL = 'http://tilemill-testing.s3.amazonaws.com/tilelive_test/world.mml';
var CARTOFILE = __dirname + '/data/world.mml';
var CARTOOBJ = {
    "srs": "+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +no_defs",
    "Stylesheet": [
        {
            "id": "style.mss",
            "data": "#world {line-color: #000;}"
        }
    ],
    "Layer": [
        {
            "id": "world",
            "name": "world",
            "srs": "+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +no_defs",
            "geometry": "polygon",
            "Datasource": {
                "file": "http://tilemill-data.s3.amazonaws.com/world_borders_merc.zip",
                "type": "shape"
            }
        }
    ]
};
var MAPNIKFILE = __dirname + '/data/stylesheet.xml';
var MAPNIKSTRING = '<?xml version="1.0" encoding="utf-8"?>' +
    '<!DOCTYPE Map[]>' +
    '<Map srs="+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +no_defs" background-color="steelblue">' +
    '<Style name="world" filter-mode="first">' +
    '<Rule>' +
    '<PolygonSymbolizer fill="white" />' +
    '<LineSymbolizer stroke="grey" stroke-width=".2" />' +
    '</Rule>' +
    '</Style>' +
    '<Layer ' +
    'name="world" ' +
    'srs="+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +no_defs">' +
    '<StyleName>world</StyleName>' +
    '<Datasource>' +
    '<Parameter name="file">' + __dirname + '/data/world_merc/world_merc</Parameter>' +
    '<Parameter name="type">shape</Parameter>' +
    '</Datasource>' +
    '</Layer>' +
    '</Map>';

exports['cartourl'] = function() {
    var map = new mapnik.Map(CARTOURL);
    map.initialize(function(err) {
        if (err) throw err;
        mapnik.serve(map, OPTIONS, function(err, data) {
            assert.isNull(err, 'The rendering should not return an error.');
            assert.ok(data, 'The rendering returned data.');
            assert.ok(data[0].length > 18000 && data[0].length <  19000, 'The rendered data is of appropriate size.');
        });
    });
};

exports['cartolocal'] = function() {
    var map = new mapnik.Map(CARTOFILE);
    map.initialize(function(err) {
        if (err) throw err;
        mapnik.serve(map, OPTIONS, function(err, data) {
            assert.isNull(err, 'The rendering should not return an error.');
            assert.ok(data, 'The rendering returned data.');
            assert.ok(data[0].length > 18000 && data[0].length <  19000, 'The rendered data is of appropriate size.');
        });
    });
};

exports['cartojson'] = function() {
    var map = new mapnik.Map(CARTOOBJ);
    map.initialize(function(err) {
        if (err) throw err;
        mapnik.serve(map, OPTIONS, function(err, data) {
            assert.isNull(err, 'The rendering should not return an error.');
            assert.ok(data, 'The rendering returned data.');
            assert.ok(data[0].length > 18000 && data[0].length <  19000, 'The rendered data is of appropriate size.');
        });
    });
};

exports['xmllocal'] = function() {
    var map = new mapnik.Map(MAPNIKFILE);
    map.initialize(function(err) {
        if (err) throw err;
        mapnik.serve(map, OPTIONS, function(err, data) {
            assert.isNull(err, 'The rendering should not return an error.');
            assert.ok(data, 'The rendering returned data.');
            assert.ok(data[0].length > 27000 && data[0].length <  28000, 'The rendered data is of appropriate size.');
        });
    });
};

exports['xmlstring'] = function() {
    var map = new mapnik.Map(MAPNIKSTRING);
    map.initialize(function(err) {
        if (err) throw err;
        mapnik.serve(map, OPTIONS, function(err, data) {
            assert.isNull(err, 'The rendering should not return an error.');
            assert.ok(data, 'The rendering returned data.');
            fs.writeFileSync(__dirname + '/xmlstring.png', data[0]);
            assert.ok(data[0].length > 27000 && data[0].length <  28000, 'The rendered data is of appropriate size.');
        });
    });
};


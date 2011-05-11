var mapnik = require('../index'),
    assert = require('assert'),
    fs = require('fs');

var OPTIONS = {
    bbox: [-20037508.34, -20037508.34, 20037508.34, 20037508.34],
    format: 'png'
};
var OPTIONSGRID = {
    bbox: [-20037508.34, -20037508.34, 20037508.34, 20037508.34],
    format: 'grid.json',
    key: 'ISO2',
    layer: 'world',
    fields: ['NAME']
};

var CARTOURL = 'http://tilemill-testing.s3.amazonaws.com/tilelive_test/world.mml';
var CARTOFILE = __dirname + '/data/world.mml';
var CARTOOBJ = JSON.parse(fs.readFileSync(CARTOFILE, 'utf8'));
var MAPNIKFILE = __dirname + '/data/stylesheet.xml';
var MAPNIKSTRING = fs.readFileSync(MAPNIKFILE, 'utf8').replace('world_merc/world_merc', __dirname + '/data/world_merc/world_merc');

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
            assert.ok(data[0].length > 27000 && data[0].length <  28000, 'The rendered data is of appropriate size.');
        });
    });
};

exports['grid'] = function() {
    var map = new mapnik.Map(MAPNIKSTRING);
    map.initialize(function(err) {
        if (err) throw err;
        mapnik.serve(map, OPTIONSGRID, function(err, data) {
            assert.isNull(err, 'The rendering should not return an error.');
            assert.ok(data, 'The rendering returned data.');
            assert.ok(data[0].grid.length === 64, 'The grid has 64 rows.');
            assert.ok(data[0].keys.length === 145, 'The grid includes 145 keys.');
            assert.ok(data[0].data.ZW.NAME === 'Zimbabwe', 'The grid includes data');
        });
    });
};

// @TODO: test PDF, JPEG

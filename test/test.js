var mapnik = require('../index'),
    assert = require('assert'),
    fs = require('fs');

// Recreate output directory to remove previous tests.
var output = __dirname + '/output';
try { fs.mkdirSync(output, 0755); } catch(err) {}

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

var CARTOURL = 'http://mapbox.github.com/tilelive-mapnik/test/world.mml';
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
            fs.writeFileSync(output + '/cartourl.png', data[0], 'binary');
            assert.ok(data[0].length > 16000 && data[0].length <  22000, 'The rendered data is of appropriate size.');
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
            fs.writeFileSync(output + '/cartolocal.png', data[0], 'binary');
            assert.ok(data[0].length > 16000 && data[0].length <  22000, 'The rendered data is of appropriate size.');
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
            fs.writeFileSync(output + '/cartojson.png', data[0], 'binary');
            assert.ok(data[0].length > 16000 && data[0].length <  22000, 'The rendered data is of appropriate size.');
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
            fs.writeFileSync(output + '/xmllocal.png', data[0], 'binary');
            assert.ok(data[0].length > 24000 && data[0].length <  30000, 'The rendered data is of appropriate size.');
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
            fs.writeFileSync(output + '/xmlstring.png', data[0], 'binary');
            assert.ok(data[0].length > 24000 && data[0].length <  30000, 'The rendered data is of appropriate size.');
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
            assert.ok(data[0].keys.length === 131, 'The grid includes 145 keys.');
            assert.ok(data[0].data.ZW.NAME === 'Zimbabwe', 'The grid includes data');
        });
    });
};


// @TODO: test PDF, JPEG

var fs = require('fs');
var assert = require('./support/assert');
var mapnik = require('..');

var tileCoords = [
    [0, 0, 0],
    [1, 0, 0],
    [1, 0, 1],
    [1, 1, 0],
    [1, 1, 1],
    [2, 0, 0],
    [2, 0, 1],
    [2, 0, 2],
    [2, 0, 3],
    [2, 1, 0],
    [2, 1, 1],
    [2, 1, 2],
    [2, 1, 3],
    [2, 2, 0],
    [2, 2, 1],
    [2, 2, 2],
    [2, 2, 3],
    [2, 3, 0],
    [2, 3, 1],
    [2, 3, 2],
    [2, 3, 3]
];

var tileCoordsCompletion = {};
tileCoords.forEach(function(coords) {
    tileCoordsCompletion['tile_' + coords[0] + '_' + coords[1] + '_' + coords[2]] = true;
});


exports['getTile()'] = function(beforeExit) {
    var completion = {};
    new mapnik('mapnik://./test/data/world.mml', function(err, source) {
        if (err) throw err;

        tileCoords.forEach(function(coords) {
            source.getTile(coords[0], coords[1], coords[2], function(err, tile, headers) {
                if (err) throw err;
                var key = coords[0] + '_' + coords[1] + '_' + coords[2];
                assert.imageEqualsFile(tile, 'test/fixture/tiles/transparent_' + key + '.png', function(err, similarity) {
                    completion['tile_' + key] = true;
                    if (err) throw err;
                    assert.deepEqual(headers, {
                        "Content-Type": "image/png"
                    });
                });
            });
        });
    });

    beforeExit(function() {
        assert.deepEqual(completion, tileCoordsCompletion);
    });
};


exports['getTile() with JSON mml file'] = function(beforeExit) {
    var completion = {};
    var mml = JSON.parse(fs.readFileSync('./test/data/world.mml', 'utf8'));
    var uri = {
        protocol: 'mapnik:',
        data: mml
    };

    new mapnik(uri, function(err, source) {
        if (err) throw err;

        tileCoords.forEach(function(coords) {
            source.getTile(coords[0], coords[1], coords[2], function(err, tile, headers) {
                if (err) throw err;
                var key = coords[0] + '_' + coords[1] + '_' + coords[2];
                assert.imageEqualsFile(tile, 'test/fixture/tiles/transparent_' + key + '.png', function(err, similarity) {
                    completion['tile_' + key] = true;
                    if (err) throw err;
                    assert.deepEqual(headers, {
                        "Content-Type": "image/png"
                    });
                });
            });
        });
    });

    beforeExit(function() {
        assert.deepEqual(completion, tileCoordsCompletion);
    });
};


exports['getTile() with URL mml file'] = function(beforeExit) {
    var completion = {};

    new mapnik('mapnik://mapbox.github.com/tilelive-mapnik/test/world.mml', function(err, source) {
        // console.warn
        if (err) throw err;

        tileCoords.forEach(function(coords) {
            source.getTile(coords[0], coords[1], coords[2], function(err, tile, headers) {
                if (err) throw err;
                var key = coords[0] + '_' + coords[1] + '_' + coords[2];
                assert.imageEqualsFile(tile, 'test/fixture/tiles/gray_' + key + '.png', function(err, similarity) {
                    completion['tile_' + key] = true;
                    if (err) throw err;
                    assert.deepEqual(headers, {
                        "Content-Type": "image/png"
                    });
                });
            });
        });
    });

    beforeExit(function() {
        assert.deepEqual(completion, tileCoordsCompletion);
    });
};


exports['getTile() with invalid style'] = function(beforeExit) {
    var completion = false;
    new mapnik('mapnik://./test/data/invalid_style.mml', function(err, source) {
        completion = true;
        assert.ok(err);
        assert.equal(err.message, "Missing closing `}` at style.mss:1:25");
    });

    beforeExit(function() {
        assert.ok(completion);
    })
};

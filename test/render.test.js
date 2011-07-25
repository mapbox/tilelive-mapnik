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
    new mapnik('mapnik://./test/data/world.xml', function(err, source) {
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


exports['getTile() with XML string'] = function(beforeExit) {
    var xml = fs.readFileSync('./test/data/world.xml', 'utf8');

    var completion = {};
    new mapnik({
        protocol: 'mapnik:',
        pathname: './test/data/world.xml',
        search: '?' + Date.now(), // prevents caching
        xml: xml
    }, function(err, source) {
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

exports['getTile() with invalid style'] = function(beforeExit) {
    var completion = false;
    new mapnik('mapnik://./test/data/invalid_style.xml', function(err, source) {
        completion = true;
        assert.ok(err);
        assert.equal(err.message, "XML document not well formed: \nStart tag expected, '<' not found\n");
    });

    beforeExit(function() {
        assert.ok(completion);
    })
};

exports['getTile() with missing style'] = function(beforeExit) {
    var completion = false;
    new mapnik('mapnik://./test/data/missing.xml', function(err, source) {
        completion = true;
        assert.ok(err);
        assert.equal(err.code, "ENOENT");
    });

    beforeExit(function() {
        assert.ok(completion);
    })
};

exports['getTile() with bad style'] = function(beforeExit) {
    var completion = false;
    new mapnik('mapnik://./test/data/world_bad.xml', function(err, source) {
        completion = true;
        assert.ok(err);
        assert.ok(err.message.search('Unknown child node in \'Style\'.') === 0);
    });

    beforeExit(function() {
        assert.ok(completion);
    })
};

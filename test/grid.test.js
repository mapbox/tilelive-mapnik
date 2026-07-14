var fs = require('fs');
var assert = require('assert');
var mapnik_backend = require('..');

describe('Render ', function() {
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
        tileCoordsCompletion['grid_' + coords[0] + '_' + coords[1] + '_' + coords[2]] = true;
    });
  
    describe('getGrid() ', function() {
        var source;
        var completion = {};
        before(function(done) {
            new mapnik_backend('mapnik://./test/data/test.xml', function(err, s) {
                if (err) throw err;
                source = s;
                done();
            });
        });
        after(function(done) {
            source.close(done);
        });
        it('validates', function(done) {
            var count = 0;
            tileCoords.forEach(function(coords,idx,array) {
                source.getGrid(coords[0], coords[1], coords[2], function(err, info, headers) {
                    var key = coords[0] + '_' + coords[1] + '_' + coords[2];
                    completion['grid_' + key] = true;
                    if (err) throw err;
                    var expected = 'test/fixture/grids/' + key + '.grid.json';
                    if (!fs.existsSync(expected) || process.env.UPDATE)
                    {
                        fs.writeFileSync(expected,JSON.stringify(info, null, 4));
                    }
                    assert.deepEqual(info, JSON.parse(fs.readFileSync('test/fixture/grids/' + key + '.grid.json', 'utf8')));
                    assert.deepEqual(headers, {
                        "Content-Type": "application/json"
                    });
                    ++count;
                    if (count == array.length) {
                        assert.deepEqual(completion,tileCoordsCompletion);
                        done();
                    }
                });
            });
        });

        it('renders for zoom>30', function(done) {
            source.getGrid(31, 0, 0, function(err, info, headers) {
                if (err) throw err;
                assert.deepEqual(info, JSON.parse(fs.readFileSync('test/fixture/grids/empty.grid.json', 'utf8')));
                assert.deepEqual(headers, {
                    "Content-Type": "application/json"
                });
                done();
            });
        });
    });
});

describe('Grid Render Errors ', function() {

    it('invalid layer', function(done) {
        new mapnik_backend('mapnik://./test/data/invalid_interactivity_1.xml', function(err, source) {
            if (err) throw err;
            source.getGrid(0, 0, 0, function(err, info, headers) {
                assert.ok(err);
                assert.equal(err.message, "Layer name 'blah' not found");
                source.close(function(err) {
                    done();
                });
            });
        });
    });

});

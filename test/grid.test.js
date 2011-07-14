var fs = require('fs');
var assert = require('assert');
var mapnik = require('..');


exports['getGrid()'] = function(beforeExit) {
    var completed = false;
    new mapnik('mapnik://./test/data/test.mml', function(err, source) {
        if (err) throw err;

        source.getGrid(0, 0, 0, function(err, info) {
            completed = true;
            if (err) throw err;
            // fs.writeFileSync('test/fixture/grids/0_0_0.grid.json', JSON.stringify(info, null, 4));
            assert.deepEqual(info, JSON.parse(fs.readFileSync('test/fixture/grids/0_0_0.grid.json', 'utf8')));
        });
    });

    beforeExit(function() {
        assert.ok(completed);
    });
};

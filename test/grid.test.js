var fs = require('fs');
var assert = require('assert');
var mapnik_backend = require('..');


// exports['getGrid()'] = function(beforeExit) {
//     var completion = {};
//     new mapnik_backend('mapnik://./test/data/test.xml', function(err, source) {
//         if (err) throw err;

//         [   [0, 0, 0],
//             [1, 0, 0],
//             [1, 0, 1],
//             [1, 1, 0],
//             [1, 1, 1],
//             [2, 0, 0],
//             [2, 0, 1],
//             [2, 0, 2],
//             [2, 0, 3],
//             [2, 1, 0],
//             [2, 1, 1],
//             [2, 1, 2],
//             [2, 1, 3],
//             [2, 2, 0],
//             [2, 2, 1],
//             [2, 2, 2],
//             [2, 2, 3],
//             [2, 3, 0],
//             [2, 3, 1],
//             [2, 3, 2],
//             [2, 3, 3]
//         ].forEach(function(coords) {
//             source.getGrid(coords[0], coords[1], coords[2], function(err, info, headers) {
//                 var key = coords[0] + '_' + coords[1] + '_' + coords[2];
//                 completion['grid_' + key] = true;
//                 if (err) throw err;
//                 assert.deepEqual(info, JSON.parse(fs.readFileSync('test/fixture/grids/' + key + '.grid.json', 'utf8')));
//                 assert.deepEqual(headers, {
//                     "Content-Type": "text/javascript; charset=utf-8"
//                 });
//             });
//         });
//     });

//     beforeExit(function() {
//         assert.deepEqual(completion, {
//             grid_0_0_0: true,
//             grid_1_0_0: true,
//             grid_1_0_1: true,
//             grid_1_1_0: true,
//             grid_1_1_1: true,
//             grid_2_0_0: true,
//             grid_2_0_1: true,
//             grid_2_0_2: true,
//             grid_2_0_3: true,
//             grid_2_1_0: true,
//             grid_2_1_1: true,
//             grid_2_1_2: true,
//             grid_2_1_3: true,
//             grid_2_2_0: true,
//             grid_2_2_1: true,
//             grid_2_2_2: true,
//             grid_2_2_3: true,
//             grid_2_3_0: true,
//             grid_2_3_1: true,
//             grid_2_3_2: true,
//             grid_2_3_3: true
//         });
//     });
// };

exports['getGrid() with invalid layer'] = function(beforeExit) {
    var completed = false;
    new mapnik_backend('mapnik://./test/data/invalid_interactivity_1.xml', function(err, source) {
        if (err) throw err;

        source.getGrid(0, 0, 0, function(err, info, headers) {
            completed = true;
            assert.ok(err);
            assert.equal(err.message, "Layer name 'blah' not found");
        });
    });

    beforeExit(function() {
        assert.ok(completed);
    });
};

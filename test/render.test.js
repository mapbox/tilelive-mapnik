var fs = require('fs');
var assert = require('assert');
var mapnik = require('..');

assert.imageEqualsFile = function(buffer, file_b, callback) {
    if (!callback) callback = function(err) { if (err) throw err; };
    file_b = require('path').resolve(file_b);
    var file_a = '/tmp/' + (Math.random() * 1e16);
    var err = require('fs').writeFileSync(file_a, buffer);
    if (err) throw err;

    require('child_process').exec('compare -metric PSNR "' + file_a + '" "' +
            file_b + '" /dev/null', function(err, stdout, stderr) {
        if (err) {
            require('fs').unlinkSync(file_a);
            callback(err);
        } else {
            stderr = stderr.trim();
            if (stderr === 'inf') {
                require('fs').unlinkSync(file_a);
                callback(null);
            } else {
                var similarity = parseFloat(stderr);
                var err = new Error('Images not equal(' + similarity + '): ' +
                        file_a  + '    ' + file_b);
                err.similarity = similarity;
                callback(err);
            }
        }
    });
};


exports['getTile()'] = function(beforeExit) {
    var completion = {};
    new mapnik('mapnik://./test/data/world.mml', function(err, source) {
        if (err) throw err;
        
        [   [0, 0, 0],
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
        ].forEach(function(coords) {
            source.getTile(coords[0], coords[1], coords[2], function(err, tile) {
                if (err) throw err;
                var key = coords[0] + '_' + coords[1] + '_' + coords[2];
                assert.imageEqualsFile(tile, 'test/fixture/' + key + '.png', function(err, similarity) {
                    completion['tile_' + key] = true;
                    if (err) throw err;
                });
            });
        });
    });

    beforeExit(function() {
        assert.ok(completion);
    });
};

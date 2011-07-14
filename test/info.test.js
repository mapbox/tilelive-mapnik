var fs = require('fs');
var assert = require('assert');
var mapnik = require('..');


exports['getInfo()'] = function(beforeExit) {
    var completed = false;
    new mapnik('mapnik://./test/data/world.mml', function(err, source) {
        if (err) throw err;

        source.getInfo(function(err, info) {
            completed = true;
            if (err) throw err;
            assert.deepEqual(info, {
                name: 'world',
                id: 'world',
                minzoom: 0,
                maxzoom: 22,
                center: [ 0, 4.317819745709997, 2 ],
                bounds: [ -180, -79.11799791776475, 180, 87.75363740918475 ]
            });
            // source._close();
        });
    });

    beforeExit(function() {
        assert.ok(completed);
    })
};

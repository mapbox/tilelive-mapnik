var fs = require('fs');
var assert = require('assert');
var mapnik = require('..');


exports['getInfo()'] = function(beforeExit) {
    var completed = false;
    new mapnik('mapnik://./test/data/world.xml', function(err, source) {
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
        });
    });

    beforeExit(function() {
        assert.ok(completed);
    })
};

exports['getInfo() with XML string'] = function(beforeExit) {
    var xml = fs.readFileSync('./test/data/world.xml', 'utf8');

    var completed = false;
    new mapnik({
        protocol: 'mapnik:',
        pathname: './test/data/world.xml',
        search: '?' + Date.now(), // prevents caching
        xml: xml
    }, function(err, source) {
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
        });
    });

    beforeExit(function() {
        assert.ok(completed);
    })
};

exports['getInfo() with formatter'] = function(beforeExit) {
    var completed = false;
    new mapnik('mapnik://./test/data/test.xml', function(err, source) {
        if (err) throw err;

        source.getInfo(function(err, info) {
            completed = true;
            if (err) throw err;
            assert.deepEqual(info, {
                name: 'test',
                id: 'test',
                minzoom: 0,
                maxzoom: 22,
                center: [ 1.054687500000007, 29.53522956294847, 2 ],
                bounds: [ -180, -79.11799791776475, 180, 87.75363740918475 ],
                // @TODO: move this back to tilelive-mapnik?
                // formatter: "function(options, data) { switch (options.format) { case 'full': return '' + data[\"NAME\"] + ''; break; case 'location': return ''; break; case 'teaser': default: return '' + data[\"NAME\"] + ''; break; } }"
            });
        });
    });

    beforeExit(function() {
        assert.ok(completed);
    })
};

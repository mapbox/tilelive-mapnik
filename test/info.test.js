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
            var expected = {
                name: 'world',
                id: 'world',
                minzoom: 0,
                maxzoom: 22,
                center: [ 0, 0, 2 ]
            };
            assert.equal(info.name,expected.name);
            assert.equal(info.id,expected.id);
            assert.equal(info.minzoom,expected.minzoom);
            assert.equal(info.maxzoom,expected.maxzoom);
            assert.deepEqual(info.center,expected.center);
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
            var expected = {
                name: 'world',
                id: 'world',
                minzoom: 0,
                maxzoom: 22,
                center: [ 0, 0, 2 ]
            };
            assert.equal(info.name,expected.name);
            assert.equal(info.id,expected.id);
            assert.equal(info.minzoom,expected.minzoom);
            assert.equal(info.maxzoom,expected.maxzoom);
            assert.deepEqual(info.center,expected.center);
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
            var expected = {
                name: 'test',
                id: 'test',
                minzoom: 0,
                maxzoom: 22,
                center: [ 1.054687500000007, 29.53522956294847, 2 ]
            };
            assert.equal(info.name,expected.name);
            assert.equal(info.id,expected.id);
            assert.equal(info.minzoom,expected.minzoom);
            assert.equal(info.maxzoom,expected.maxzoom);
            assert.deepEqual(info.center,expected.center);
        });
    });

    beforeExit(function() {
        assert.ok(completed);
    })
};

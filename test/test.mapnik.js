var assert = require('assert');
var mapnik_backend = require('..');
var mapnik = require("mapnik");

describe('.mapnik', function() {

    it('exposes the mapnik binding', function() {
        assert.equal(mapnik, mapnik_backend.mapnik);
    });
});

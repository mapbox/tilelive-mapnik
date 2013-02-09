var fs = require('fs');
var assert = require('./support/assert');
var mapnik_backend = require('..');
var util = require('util');


describe('Handling Errors ', function() {

    it('invalid style', function(done) {
        new mapnik_backend('mapnik://./test/data/invalid_style.xml', function(err, source) {
            assert.ok(err);
            assert.ok(err.message.search('XML document not') !== -1);
            if (source) {
                source.close(function(err) {
                    done();
                });
            } else {
                done();
            }
        });
    });

    it('missing data', function(done) {
        new mapnik_backend('mapnik://./test/data/missing.xml', function(err, source) {
            assert.ok(err);
            assert.equal(err.code, "ENOENT");
            if (source) {
                source.close(function(err) {
                    done();
                });
            } else {
                done();
            }
        });
    });

    it('bad style', function(done) {
        new mapnik_backend('mapnik://./test/data/world_bad.xml', function(err, source) {
            assert.ok(err);
            assert.ok(err.message.search('XML document not well formed') != -1);
            if (source) {
                source.close(function(err) {
                    done();
                });
            } else {
                done();
            }
        });
    });


});

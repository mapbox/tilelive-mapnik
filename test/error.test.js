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

    it('invalid image format', function(done) {
        new mapnik_backend('mapnik://./test/data/test.xml', function(err, source) {
            if (err) throw err;
            source._info.format = 'this is an invalid image format';
            source.getTile(0,0,0, function(err, tile, headers) {
                assert.equal(err.message,'unknown file type: this is an invalid image format');
                source.close(function(err) {
                    done();
                });
            });
        });
    });

    it('invalid image format 2', function(done) {
        new mapnik_backend('mapnik://./test/data/test.xml', function(err, source) {
            if (err) throw err;
            source._info.format = 'png8:z=20';
            source.getTile(0,0,0, function(err, tile, headers) {
                assert.equal(err.message,'invalid compression parameter: 20 (only -1 through 10 are valid)');
                source.close(function(err) {
                    done();
                });
            });
        });
    });

});

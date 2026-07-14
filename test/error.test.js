var fs = require('fs');
var assert = require('./support/assert');
var mapnik_backend = require('..');
var util = require('util');


describe('Handling Errors ', function() {

    it('invalid style', function(done) {
        new mapnik_backend('mapnik://./test/data/invalid_style.xml', function(err, source) {
            assert.ok(err);
            // first message is from rapidxml, second is from libxml2
            assert.ok((err.message.search('expected < at line 1') !== -1) || (err.message.search('XML document not') !== -1));
            if (source) {
                source.close(function(err) {
                    done();
                });
            } else {
                done();
            }
        });
    });

    // See https://github.com/mapbox/tilelive-mapnik/pull/74
    it('invalid font, strict', function(done) {
        new mapnik_backend({pathname:'./test/data/invalid_font_face.xml', strict:true}, function(err, source) {
            try {
              assert.ok(err);
              assert.ok(err.message.search("font face") !== -1, err.message);
              if (source) {
                  source.close(function(err) {
                      done();
                  });
              } else {
                  done();
              }
            } catch (err) { done(err); }
        });
    });

    // See https://github.com/mapbox/tilelive-mapnik/pull/74
    it('invalid font, non-strict (default)', function(done) {
        new mapnik_backend({pathname:'./test/data/invalid_font_face.xml'}, function(err, source) {
            try {
              assert.ok(!err, err);
              done();
            } catch (err) { done(err); }
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
            assert.ok((err.message.search('invalid closing tag') != -1) || (err.message.search('XML document not well formed') != -1));
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
                assert(err.message.match(/invalid compression parameter: 20 \(only -1 through (9|10) are valid\)/), 'error message mismatch: ' + err.message);
                source.close(function(err) {
                    done();
                });
            });
        });
    });

    ['getTile', 'getGrid'].forEach(function(method) {

        it('coordinates out of range: ' + method, function(done) {
            new mapnik_backend('mapnik://./test/data/test.xml', function(err, source) {
                if (err) throw err;
                source[method](0, -1, 0, function(err) {
                    assert(err.message.match(/Coordinates out of range/), 'error message mismatch: ' + err.message);
                    source.close(function() {
                        done();
                    });
                });
            });
        });

        it('coordinates out of range, not finite: ' + method, function(done) {
            new mapnik_backend('mapnik://./test/data/test.xml', function(err, source) {
                if (err) throw err;
                source[method](1024, 0, 0, function(err) {
                    assert(err.message.match(/Coordinates out of range/), 'error message mismatch: ' + err.message);
                    source.close(function() {
                        done();
                    });
                });
            });
        });

    });

});

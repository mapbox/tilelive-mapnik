var fs = require('fs');
var assert = require('assert');
var mapnik_backend = require('..');

describe('Closing behavior ', function() {

    it('should close cleanly 1', function(done) {
        new mapnik_backend('mapnik://./test/data/world.xml', function(err, source) {
            if (err) throw err;
            var cache_len = Object.keys(source._cache).length;
            assert.ok(source._cache[source._self_cache_key]);
            // now close the source
            source.close(function(err){
                assert.equal(err,undefined);
                var new_cache_length = Object.keys(source._cache).length;
                assert.equal(cache_len,new_cache_length+1);
                assert.ok(!source._cache[source._self_cache_key]);
                done();
            });
        });
    });

    it('should close cleanly 2', function(done) {
        new mapnik_backend('mapnik://./test/data/world.xml', function(err, source) {
            if (err) throw err;
            source.getTile(0,0,0, function(err, info, headers) {
                if (err) throw err;
                var cache_len = Object.keys(source._cache).length;
                // now close the source
                source.close(function(err){
                    assert.equal(err,undefined);
                    var new_cache_length = Object.keys(source._cache).length;
                    assert.equal(cache_len,new_cache_length+1);
                    done();
                });
            });
        });
    });

    it('should throw with invalid usage (close before getTile)', function(done) {
        new mapnik_backend('mapnik://./test/data/world.xml', function(err, source) {
            if (err) throw err;
            // now close the source
            // now that the pool is draining further
            // access to the source is invalid and should throw
            source.close(function(err){
                // pool will be draining...
            });
            source.getTile(0,0,0, function(err, info, headers) {
                assert.equal(err.message,'pool is draining and cannot accept work');
                done();
            });
        });
    });

    it('should throw with invalid usage (close after getTile)', function(done) {
        new mapnik_backend('mapnik://./test/data/world.xml', function(err, source) {
            if (err) throw err;
            source.getTile(0,0,0, function(err, info, headers) {
                // now close the source
                source.close(function(err){
                    // pool will be draining...
                });
                // now that the pool is draining further
                // access to the source is invalid and should throw
                source.getTile(0,0,0, function(err, info, headers) {
                    assert.equal(err.message,'pool is draining and cannot accept work');
                    done();
                });
            });
        });
    });

});
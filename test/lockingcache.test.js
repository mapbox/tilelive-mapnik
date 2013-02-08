var assert = require('assert');
var LockingCache = require('../lib/lockingcache');

describe('locking cache', function() {

    it('cache works', function(done) {
        var cache = new LockingCache(function generate(key) {
            process.nextTick(function() {
                cache.put(key, null, '=' + key);
            });
            return [key];
        }, 50);
    
        cache.get(1, function(err, value) {
            assert.ok(!err);
            assert.equal(value, '=1');
            done();
        });
    });

    it('multiple requests get same response', function(done) {
        var n = 0;
        var cache = new LockingCache(function generate(key) {
            process.nextTick(function() {
                cache.put(key, null, '=' + n++);
            });
            return [key];
        }, 50);
    
        cache.get('key', function(err, value) {
            assert.ok(!err);
            assert.equal(value, '=0');
            cache.get('key', function(err, value) {
                assert.ok(!err);
                assert.equal(value, '=0');
                done();
            });
        });
    });
    it('errors get propagated', function(done) {
        var cache = new LockingCache(function generate(key) {
            process.nextTick(function() {
                cache.put(key, new Error('hi2u'));
            });
            return [key];
        }, 50);
    
        cache.get('key', function(err, value) {
            assert.ok(err);
            assert.equal(err.toString(), 'Error: hi2u');
            done();
        });
    });

    it('multiple error-ed requests get the same response', function(done) {
        var n = 0;
        var cache = new LockingCache(function generate(key) {
            process.nextTick(function() {
                cache.put(key, new Error(n++));
            });
            return [key];
        }, 50);
    
        cache.get('key', function(err, value) {
            assert.ok(err);
            assert.equal(err, 'Error: 0');
            cache.get('key', function(err, value) {
                assert.ok(err);
                assert.equal(err, 'Error: 0');
                done();
            });
        });
    });

    it('derived keys get the same response', function(done) {
        var n = 0;
        var cache = new LockingCache(function generate(key) {
            process.nextTick(function() {
                cache.put(key, null, '=' + n);
                cache.put(key + 'a', null, '=' + n);
                n++;
            });
            return [key, key + 'a'];
        }, 50);
    
        var resultCount = 0;
        cache.get('1', function(err, value) {
            assert.ok(!err);
            assert.equal(value, '=0');
            cache.get('1a', function(err, value) {
                assert.ok(!err);
                assert.equal(value, '=0');
                done();
            });
        });
    });

    it('.clear()', function(done) {
        var cache = new LockingCache(function generate(key) {
            setTimeout(function() {
                cache.put(key, null, '=' + key);
            }, 5);
            return [key];
        }, 50);
    
        cache.get('1', function(err, value) {
            assert.ok(!err);
            assert.equal(value, '=1');
            // cache.clear doesn't nuke outstanding callbacks, only timeouts
            // which don't exist until we get a response, and then get deleted anyway
            cache.clear();
            done();
        });
    });


    it('.del()', function(done) {
        var cache = new LockingCache(function generate(key) {
            setTimeout(function() {
                cache.put(key, null, '=' + key);
            }, 5);
            return [key];
        }, 50);
    
        cache.get('1', function(err, value) {
            assert.ok(false);
        });
        cache.del('1');
        done();
    });


    it('later requests get a cached response', function(done) {
        var n = 0;
        var cache = new LockingCache(function generate(key) {
            process.nextTick(function() {
                cache.put(key, null, '=' + n++);
            });
            return [key];
        }, 50);
    
        cache.get('key', function(err, value) {
            assert.ok(!err);
            assert.equal(value, '=0');
    
            cache.get('key', function(err, value) {
                assert.ok(!err);
                assert.equal(value, '=0');
            });
    
            setTimeout(function() {
                cache.get('key', function(err, value) {
                    assert.ok(!err);
                    assert.equal(value, '=0');
                    done();
                });
            }, 10);
        });
    });

    it('test cache with timeout=0', function(done) {
        var n = 0;
        var cache = new LockingCache(function generate(key) {
            process.nextTick(function() {
                cache.put(key, null, '=' + n++);
            });
            return [key];
        }, 0);
    
        cache.get('key', function(err, value) {
            // (A) should get the first result
            assert.ok(!err);
            assert.equal(value, '=0');
    
            cache.get('key', function(err, value) {
                // (C) should get the second result. The first result should be
                // timed-out already even though we're calling it in the same tick
                // as our cached callbacks (ie. even before B below)
                assert.ok(!err);
                assert.equal(value, '=1');
                done();
            });
        });
        cache.get('key', function(err, value) {
            // (B) should get the first result, because it's queued
            assert.ok(!err);
            assert.equal(value, '=0');
        });
    });
});

var assert = require('assert');
var LockingCache = require('../lib/lockingcache');


exports['cache works'] = function(beforeExit) {
    var cache = new LockingCache(function generate(key) {
        process.nextTick(function() {
            cache.put(key, null, '=' + key);
        });
        return [key];
    }, 50);

    cache.get(1, function(err, value) {
        assert.ok(!err);
        assert.equal(value, '=1');
    });
};

exports['multiple requests get the same response'] = function(beforeExit) {
    var n = 0;
    var cache = new LockingCache(function generate(key) {
        process.nextTick(function() {
            cache.put(key, null, '=' + n++);
        });
        return [key];
    }, 50);

    var resultCount = 0;
    cache.get('key', function(err, value) {
        assert.ok(!err);
        assert.equal(value, '=0');
        resultCount++;
    });
    cache.get('key', function(err, value) {
        assert.ok(!err);
        assert.equal(value, '=0');
        resultCount++;
    });

    beforeExit(function() {
        assert.equal(resultCount, 2);
    });
};

exports['errors get propagated'] = function(beforeExit) {
    var cache = new LockingCache(function generate(key) {
        process.nextTick(function() {
            cache.put(key, new Error('hi2u'));
        });
        return [key];
    }, 50);

    cache.get('key', function(err, value) {
        assert.ok(err);
        assert.equal(err.toString(), 'Error: hi2u');
    });
};

exports['multiple errored requests get the same response'] = function(beforeExit) {
    var n = 0;
    var cache = new LockingCache(function generate(key) {
        process.nextTick(function() {
            cache.put(key, new Error(n++));
        });
        return [key];
    }, 50);

    var resultCount = 0;
    cache.get('key', function(err, value) {
        assert.ok(err);
        assert.equal(err, 'Error: 0');
        resultCount++;
    });
    cache.get('key', function(err, value) {
        assert.ok(err);
        assert.equal(err, 'Error: 0');
        resultCount++;
    });

    beforeExit(function() {
        assert.equal(resultCount, 2);
    });
};

exports['derived keys get the same response'] = function(beforeExit) {
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
        resultCount++;
    });
    cache.get('1a', function(err, value) {
        assert.ok(!err);
        assert.equal(value, '=0');
        resultCount++;
    });

    beforeExit(function() {
        assert.equal(resultCount, 2);
    });
};

exports['.clear()'] = function(beforeExit) {
    var cache = new LockingCache(function generate(key) {
        setTimeout(function() {
            cache.put(key, null, '=' + key);
        }, 5);
        return [key];
    }, 50);

    var resultCount = 0;
    cache.get('1', function(err, value) {
        assert.ok(!err);
        assert.equal(value, '=1');
        resultCount++;
    });

    // cache.clear doesn't nuke outstanding callbacks, only timeouts
    // which don't exist until we get a response, and then get deleted anyway
    cache.clear();

    beforeExit(function() {
        assert.equal(resultCount, 1);
    });
};

exports['.del()'] = function(beforeExit) {
    var cache = new LockingCache(function generate(key) {
        setTimeout(function() {
            cache.put(key, null, '=' + key);
        }, 5);
        return [key];
    }, 50);

    var resultCount = 0;
    cache.get('1', function(err, value) {
        assert.ok(false);
    });

    cache.del('1');

    beforeExit(function() {
        assert.equal(resultCount, 0);
    });
};

exports['later requests get a cached response'] = function(beforeExit) {
    var n = 0;
    var cache = new LockingCache(function generate(key) {
        process.nextTick(function() {
            cache.put(key, null, '=' + n++);
        });
        return [key];
    }, 50);

    var resultCount = 0;
    cache.get('key', function(err, value) {
        assert.ok(!err);
        assert.equal(value, '=0');
        resultCount++;

        cache.get('key', function(err, value) {
            assert.ok(!err);
            assert.equal(value, '=0');
            resultCount++;
        });

        setTimeout(function() {
            cache.get('key', function(err, value) {
                assert.ok(!err);
                assert.equal(value, '=0');
                resultCount++;
            });
        }, 10);
    });

    beforeExit(function() {
        assert.equal(resultCount, 3);
    });
};

exports['test cache with timeout=0'] = function(beforeExit) {
    var n = 0;
    var cache = new LockingCache(function generate(key) {
        process.nextTick(function() {
            cache.put(key, null, '=' + n++);
        });
        return [key];
    }, 0);

    var resultCount = 0;
    cache.get('key', function(err, value) {
        // (A) should get the first result
        assert.ok(!err);
        assert.equal(value, '=0');
        resultCount++;

        cache.get('key', function(err, value) {
            // (C) should get the second result. The first result should be
            // timed-out already even though we're calling it in the same tick
            // as our cached callbacks (ie. even before B below)
            assert.ok(!err);
            assert.equal(value, '=1');
            resultCount++;
        });
    });
    cache.get('key', function(err, value) {
        // (B) should get the first result, because it's queued
        assert.ok(!err);
        assert.equal(value, '=0');
        resultCount++;
    });

    beforeExit(function() {
        assert.equal(resultCount, 3);
    });
};

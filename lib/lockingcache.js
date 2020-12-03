module.exports = LockingCache;
function LockingCache(generate, options) {
    this.callbacks = {};
    this.timeouts = {};
    this.results = {};

    // When there's no generator function, you
    this.generate = generate || function() {};

    options = isFinite(options) ? { timeout: options } : (options || {});

    // Timeout cached objects after 1 minute by default.
    // A value of 0 will cause it to not cache at all beyond, just return the result to
    // all locked requests.
    this.timeout = (typeof options.timeout === "undefined") ? 60000 : options.timeout;

    // Cached results will be always removed when deleteOnHit is set to true
    // That allows to set a timeout > 0 but removing objects from the cache when they
    // are returned from the cache.
    // This option is useful when using metatile > 1 because you can evict results
    // put here because of metatiling with a timeout and remove the ones that get a hit
    this.deleteOnHit = options.deleteOnHit || false;
}

LockingCache.prototype.get = function(id, callback) {
    if (!this.callbacks[id]) this.callbacks[id] = [];
    this.callbacks[id].push(callback);

    if (this.results[id]) {
        this.trigger(id);
    } else {
        var ids = this.generate.call(this, id);
        if (!ids || ids.indexOf(id) < 0) {
            this.put(id, new Error("Generator didn't generate this item"));
        } else ids.forEach(function(id) {
            this.results[id] = this.results[id] || true;
        }, this);
    }
};

LockingCache.prototype.del = function(id) {
    delete this.results[id];
    delete this.callbacks[id];
    if (this.timeouts[id]) {
        clearTimeout(this.timeouts[id]);
        delete this.timeouts[id];
    }
};

LockingCache.prototype.put = function(id) {
    if (this.timeout > 0) {
        this.timeouts[id] = setTimeout(this.del.bind(this, id), this.timeout);
    }
    this.results[id] = Array.prototype.slice.call(arguments, 1);
    if (this.callbacks[id] && this.callbacks[id].length) {
        this.trigger(id);
    }
};

LockingCache.prototype.clear = function() {
    for (var id in this.timeouts) {
        this.del(id);
    }
};

LockingCache.prototype.trigger = function(id) {
    if (this.results[id] && this.results[id] !== true) {
        process.nextTick(function() {
            var data = this.results[id];
            var callbacks = this.callbacks[id] || [];

            if (this.timeout === 0 || this.deleteOnHit) {
                // instant purge with the first put() for a key
                // clears timeouts and results
                this.del(id);
            } else {
                delete this.callbacks[id];
            }

            callbacks.forEach(function(callback) {
                callback.apply(callback, data);
            });
        }.bind(this));
    }
};

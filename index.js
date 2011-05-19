var Map = require('./lib/map'),
    Format = require('./lib/format'),
    safe64 = require('./lib/safe64');

module.exports = {
    Map: Map,
    Format: Format,
    safe64: safe64,
    pool: function(datasource) {
        return {
            create: function(callback) {
                var resource = new Map(datasource);
                resource.initialize(function(err) {
                    if (err) throw err;
                    callback(resource);
                });
            },
            destroy: function(resource) {
                resource.destroy();
            }
        };
    },
    serve: function(resource, options, callback) {
        resource.render(options, callback);
    }
};


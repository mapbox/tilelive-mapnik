var Map = require('./lib/map');

module.exports = {
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


var Map = require('./lib/map');

module.exports = {
    pool: function(datasource, options) {
        return {
            create: function(callback) {
                var resource = new Map(datasource, options);
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


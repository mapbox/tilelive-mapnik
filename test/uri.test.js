var assert = require('assert');
var mapnik_backend = require('..');

describe('uri query options', function() {

    describe('metatileCache config', function() {

        function makeUri(metatileCache) {
            return {
                query: {
                    metatileCache: metatileCache
                }
            };
        }

        var backend;

        before(function(done) {
            backend = new mapnik_backend('mapnik://./test/data/test.xml', done);
        });

        var scenarios = [
            {
                desc: 'handles no config as default values',
                metatileCache: undefined,
                expected: {
                    ttl: 0,
                    deleteOnHit: false
                }
            },
            {
                desc: 'handles default values',
                metatileCache: {},
                expected: {
                    ttl: 0,
                    deleteOnHit: false
                }
            },
            {
                desc: 'handles ttl',
                metatileCache: {
                    ttl: 1000
                },
                expected: {
                    ttl: 1000,
                    deleteOnHit: false
                }
            },
            {
                desc: 'handles deleteOnHit',
                metatileCache: {
                    deleteOnHit: false
                },
                expected: {
                    ttl: 0,
                    deleteOnHit: false
                }
            },
            {
                desc: 'handles deleteOnHit=true',
                metatileCache: {
                    deleteOnHit: true
                },
                expected: {
                    ttl: 0,
                    deleteOnHit: true
                }
            },
            {
                desc: 'handles deleteOnHit="true"',
                metatileCache: {
                    deleteOnHit: 'true'
                },
                expected: {
                    ttl: 0,
                    deleteOnHit: true
                }
            },
            {
                desc: 'handles deleteOnHit and ttl',
                metatileCache: {
                    ttl: 1000,
                    deleteOnHit: true
                },
                expected: {
                    ttl: 1000,
                    deleteOnHit: true
                }
            }
        ];

        scenarios.forEach(function(scenario) {

            it(scenario.desc, function() {
                var uri = backend._normalizeURI(makeUri(scenario.metatileCache));

                assert.ok(uri.query.metatileCache);
                assert.equal(uri.query.metatileCache.ttl, scenario.expected.ttl);
                assert.equal(uri.query.metatileCache.deleteOnHit, scenario.expected.deleteOnHit);
            });
        });
    });
});

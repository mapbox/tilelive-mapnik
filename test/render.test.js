var fs = require('fs');
var assert = require('./support/assert');
var mapnik_backend = require('..');
var util = require('util');

describe('Render ', function() {

    it('getTile() override format', function(done) {
        new mapnik_backend('mapnik://./test/data/test.xml', function(err, source) {
            if (err) throw err;
            assert.equal(source._info.format,undefined); // so will default to png in getTile
            source._info.format = 'jpeg20';
            source.getTile(0,0,0, function(err, tile, headers) {
                assert.imageEqualsFile(tile, 'test/fixture/tiles/world-jpeg20.jpeg', function(err, similarity) {
                    if (err) throw err;
                    assert.deepEqual(headers, {
                        "Content-Type": "image/jpeg"
                    });
                    source.close(function(err){
                        done();
                    });
                });
            });
        });
    });

    var tileCoords = [
        [0, 0, 0],
        [1, 0, 0],
        [1, 0, 1],
        [1, 1, 0],
        [1, 1, 1],
        [2, 0, 0],
        [2, 0, 1],
        [2, 0, 2],
        [2, 0, 3],
        [2, 1, 0],
        [2, 1, 1],
        [2, 1, 2],
        [2, 1, 3],
        [2, 2, 0],
        [2, 2, 1],
        [2, 2, 2],
        [2, 2, 3],
        [2, 3, 0],
        [2, 3, 1],
        [2, 3, 2],
        [2, 3, 3]
    ];
    
    var tileCoordsCompletion = {};
    tileCoords.forEach(function(coords) {
        tileCoordsCompletion['tile_' + coords[0] + '_' + coords[1] + '_' + coords[2]] = true;
    });
  
    describe('getTile() ', function() {
        var source;
        var completion = {};
        before(function(done) {
            new mapnik_backend('mapnik://./test/data/world.xml', function(err, s) {
                if (err) throw err;
                source = s;
                done();
            });
        })
        it('validates', function(done) {
            var count = 0;
            tileCoords.forEach(function(coords,idx,array) {
                source._info.format = 'png32';
                source.getTile(coords[0], coords[1], coords[2],
                   function(err, tile, headers) {
                      if (err) throw err;
                      var key = coords[0] + '_' + coords[1] + '_' + coords[2];
                      assert.imageEqualsFile(tile, 'test/fixture/tiles/transparent_' + key + '.png', function(err, similarity) {
                          completion['tile_' + key] = true;
                          if (err) throw err;
                          assert.deepEqual(headers, {
                              "Content-Type": "image/png"
                          });
                          ++count;
                          if (count == array.length) {
                              assert.deepEqual(completion,tileCoordsCompletion);
                              source.close(function(err){
                                  done();
                              });
                          }
                      });
                });
            });
        });
    });
  
    describe('getTile() with XML string', function() {
        var source;
        var completion = {};
        before(function(done) {
            var xml = fs.readFileSync('./test/data/world.xml', 'utf8');
            new mapnik_backend({
                protocol: 'mapnik:',
                pathname: './test/data/world.xml',
                search: '?' + Date.now(), // prevents caching
                xml: xml } , function(err, s) {
                    if (err) throw err;
                    source = s;
                    done();
            });
        })
        it('validates', function(done) {
            var count = 0;
            tileCoords.forEach(function(coords,idx,array) {
                source._info.format = 'png32';
                source.getTile(coords[0], coords[1], coords[2],
                   function(err, tile, headers) {
                      if (err) throw err;
                      var key = coords[0] + '_' + coords[1] + '_' + coords[2];
                      assert.imageEqualsFile(tile, 'test/fixture/tiles/transparent_' + key + '.png', function(err, similarity) {
                          completion['tile_' + key] = true;
                          if (err) throw err;
                          assert.deepEqual(headers, {
                              "Content-Type": "image/png"
                          });
                          ++count;
                          if (count == array.length) {
                              assert.deepEqual(completion,tileCoordsCompletion);
                              source.close(function(err){
                                  done();
                              });
                          }
                      });
                });
            });
        });
    });
});

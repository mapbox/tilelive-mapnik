# tilelive-mapnik

Renderer backend for [tilelive.js](http://github.com/mapbox/tilelive.js) that
uses [node-mapnik](http://github.com/mapnik/node-mapnik) to render tiles and
grids from a Mapnik XML file. `tilelive-mapnik` implements the
[Tilesource API](https://github.com/mapbox/tilelive.js/blob/master/API.md).

[![Build Status](https://secure.travis-ci.org/mapbox/tilelive-mapnik.png)](http://travis-ci.org/mapbox/tilelive-mapnik)
[![Build status](https://ci.appveyor.com/api/projects/status/6am7la0hiaei8qop)](https://ci.appveyor.com/project/Mapbox/tilelive-mapnik)

## Installation

    npm install tilelive-mapnik

Though `tilelive` is not a dependency of `tilelive-mapnik` you will want to
install it to actually make use of `tilelive-mapnik` through a reasonable
API.


## Usage

```javascript
var tilelive = require('tilelive');
require('tilelive-mapnik').registerProtocols(tilelive);

tilelive.load('mapnik:///path/to/file.xml', function(err, source) {
    if (err) throw err;

    // Interface is in XYZ/Google coordinates.
    // Use `y = (1 << z) - 1 - y` to flip TMS coordinates.
    source.getTile(0, 0, 0, function(err, tile, headers) {
        // `err` is an error object when generation failed, otherwise null.
        // `tile` contains the compressed image file as a Buffer
        // `headers` is a hash with HTTP headers for the image.
    });

    // The `.getGrid` is implemented accordingly.
});
```

Note that grid generation will only work when there's metadata inside a
`<Parameters>` object in the Mapnik XML.

The key fields are `interactivity_layer` and `interactivity_fields`. See an
[example in the tests](https://github.com/mapbox/tilelive-mapnik/blob/4e9cbf8347eba7c3c2b7e8fd4270ea39f9cc7af5/test/data/test.xml#L6-L7). These `Parameters` are normally added by the application that creates the XML,
in this case [CartoCSS](https://github.com/mapbox/carto/blob/55fbafe0d0e8ec00515c5782a3664c15502f0437/lib/carto/renderer.js#L152-L189)

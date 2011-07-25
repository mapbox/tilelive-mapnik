# tilelive-mapnik

Renderer backend for [tilelive.js](http://github.com/mapbox/tilelive.js) that
uses [node-mapnik](http://github.com/mapnik/node-mapnik) to render tiles and
grids from a Mapnik XML file. `tilelive-mapnik` implements the
[Tilesource API](https://github.com/mapbox/tilelive.js/blob/master/API.md).


## Installation

    npm install tilelive-mapnik

Though `tilelive` is not a dependency of `tilelive-mapnik` you will want to
install it to actually make use of `tilelive-mapnik` through a reasonable
API.


## Usage

```javascript
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

Note that grid generation will only work when there's a `.mml` file with the
same basename as the XML file in that directory that contains information
about how interactivity should be rendered.

Alternatively you may pass data to `tilelive-mapnik` directly using an XML
string and MML object.

```javascript
var uri = {
    protocol: 'mapnik:',
    slashes: true,
    xml: '<?xml version="1.0" encoding="utf-8"?>\n<Map srs="+proj=merc ... ',
    mml: {
        interactivity: {
            layer: 'world',
            fields: ['NAME']
        },
        format: 'png'
    }
};
tilelive.load(uri, function(err, source) {
    // ...
});
```


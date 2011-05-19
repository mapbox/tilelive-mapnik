# tilelive-mapnik

Renderer backend for [tilelive.js][1] that uses [node-mapnik][2] and [carto][3]
to render tiles. Can be used to render tiles from the following datasource
formats:

    carto MML object    { "srs": ... }
    carto MML file      /path/to/map.mml
    carto MML URL       http://example.com/map.mml
    mapnik XML string   <?xml version="1.0" ...
    mapnik XML file     /path/to/map.xml


### Installation

    npm install tilelive tilelive-mapnik

Though `tilelive` is not a dependency of `tilelive-mapnik` you will want to
install it to actually make use of `tilelive-mapnik` through a reasonable
API.


### Usage

    var tilelive = new Server(require('tilelive-mapnik')),
    tilelive.serve({
        datasource: '/my/map/file.mml',
        x: 0,
        y: 0,
        z: 0,
        format: 'png'
    }, function(err, data) {
        if (!err) throw Err
        // data[0]: PNG image
        // data[1]: HTTP headers object appropriate for PNG format
    });


[1]: https://github.com/mapbox/tilelive.js
[2]: https://github.com/mapnik/node-mapnik
[3]: https://github.com/mapbox/carto

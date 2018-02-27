# tilelive-mapnik changelog

## 1.0.0

* Update to mapnik@3.7.0
* Drops support for Windows

## 0.7.0

* Upgraded to mapnik@3.6.0

## 0.6.18

* Upgraded to generic-pool@2.4.x

## 0.6.17

* Upgraded tests to latest node-mapnik@3.x

## 0.6.16

* Support for node-mapnik@3.2.x

## 0.6.15

* Support for Node v0.12.x
* Fixed handling of boolean options

## 0.6.14

* Support for Node v0.11.x

## 0.6.13

* Support for node-mapnik@3.x

## 0.6.12

* Improved cache key generation

## 0.6.11

* Support for node-mapnik >= 1.4.12

## 0.6.10

* Started auto-registering fonts (now that node-mapnik does not) which can be disabled with `?autoLoadFonts=false` (@vsivsi)
* Correct UTF grid content type (@mojodna)
* Add ?poolSize, falling back to UV_THREADPOOL_SIZE further falling back to the number of cores reported. (@mojodna)
* Report autoscale: true (@mojodna)

## 0.6.9

* node-eio dependency removed. If you are using node v0.8.x still and want to increase the threadpool size you'll need to do it yourself now.

## 0.6.8

* Accept node-mapnik@1.4.x

## 0.6.7

* Repair support for node-mapnik@0.7.x (broken in 0.6.6)

## 0.6.6

* Added support for node-mapnik@1.3.2

## 0.6.5

* Avoid trying to resolve undefined `uri.pathname` @dshorthouse

## 0.6.4

* Allow users to configure strict mode via URI (#74) (@strk)
* Loosen mapnik requirement to bet between 0.7.25 and 1.2.x (@strk)

## 0.6.3

* key solidCache on image format (#51)
* Fix tests to work with Mapnik 2.3.x (https://github.com/mapnik/mapnik/issues/2028)

## 0.6.2

* Ensure correct detection of mime type for new mapnik image formats that separate name from options using `:`.

## 0.6.1

* Fixed package.json `engines` declaration
* Upgraded to node-mapnik 1.2.0

## 0.6.0

* Upgraded to node-mapnik-1.1.2 (#68)
* Moved cache of solid tiles to tilesource (rather than global) #64
* Ensured `scale` value passed to Mapnik is a number
* Exposed mapnik binding as MapnikSource.mapnik

## 0.5.0

* Removed cached _xml property (#25)
* Fixes to behavior of source.close() and handling of draining map pool
* Improvements to setting of content-type for various output formats
* Changed to async isSolid interface in node-mapnik, which requires at least node-mapnik@0.7.17
* Converted tests to use mocha, instead of expresso (#35)
* Added ability to disable internal cache of source objects by pass `uri.query.internal_cache` (#59)
* Changed map loading to be synchronous to avoid possibility of race condition in Mapnik (#58)

## 0.4.4

* Fixed scoping typo in close()

## 0.4.3

* Fixed formatting error when reporting out of bounds Tile coords
* Properly drain pool by leveraging new `generic-pool` (#43)
* Tests output image diff for any failing image comparisions

## 0.4.2

* Supports node v8

## 0.4.1

* Supports `scale-factor` for high-dpi displays

## 0.4.0

* Merges `parameter` branch - interactivity information is now
  managed in `Parameter` XML elements in Mapnik XML source

## Future

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

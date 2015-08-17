var fs = require('fs');
var util = require('util');
var path = require('path');
var spawn = require('child_process').spawn;
var exec = require('child_process').exec;
var existsSync = require('fs').existsSync || require('path').existsSync;
var mapnik = require('mapnik');

var assert = module.exports = exports = require('assert');

assert.imageEqualsFile = function(buffer, file, meanError, format, callback) {
    if (typeof meanError == 'function') {
        callback = meanError;
        meanError = 0.05;
        format = 'png32';
    } else if (typeof format == 'function') {
        callback = format;
        format = 'png32';
    }
    
    var resultImage = new mapnik.Image.fromBytesSync(buffer);
    if (!fs.existsSync(file) || process.env.UPDATE)
    {
        resultImage.save(file, format);
    }

    var fixturesize = fs.statSync(file).size;
    var sizediff = Math.abs(fixturesize - buffer.length) / fixturesize;
    if (sizediff > meanError) {
        return callback(new Error('Image size is too different from fixture: ' + buffer.length + ' vs. ' + fixturesize));
    }
    var expectImage = new mapnik.Image.open(file);
    var pxDiff = expectImage.compare(resultImage);

    // Allow < 2% of pixels to vary by > default comparison threshold of 16.
    var pxThresh = resultImage.width() * resultImage.height() * 0.02;

    if (pxDiff > pxThresh) {
        callback(new Error('Image is too different from fixture: ' + pxDiff + ' pixels > ' + pxThresh + ' pixels'));
    } else {
        callback();
    }
}

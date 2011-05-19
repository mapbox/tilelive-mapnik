// URL-safe base64 implementation. See http://en.wikipedia.org/wiki/Base64#URL_applications
var Buffer = require('buffer').Buffer;

module.exports.encode = function(s) {
    return (new Buffer(s, 'utf-8')).toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
};

module.exports.decode = function(s) {
    s = s
        .replace(/-/g, '+')
        .replace(/_/g, '/');
    return (new Buffer(s, 'base64')).toString('utf-8');
};

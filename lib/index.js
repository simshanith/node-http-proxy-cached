'use strict';

var url = require('url');

var _ = require('lodash');
var Promise = require('bluebird');
var debug = require('debug');
var zlib = require('zlib');

var httpProxy = require('http-proxy');
var setupOutgoing = require('http-proxy/lib/http-proxy/common').setupOutgoing;

var log = debug('http-proxy-cached');

module.exports = function(options) {

  var defaults = {
    proxy: {
      target: options.proxyTarget,
      changeOrigin: true
    }
  };

  options = _.defaults(options || {}, defaults);


  function cacheResolver(req) {
    var outgoing = setupOutgoing({},
      _.assign(options.proxy, {
        target: url.parse(options.proxy.target)
      }), req);


    outgoing = _.defaults(_.pick(outgoing, [
      // https://nodejs.org/docs/v4.4.2/api/url.html
        'protocol', 'slashes',
        'auth',
        'hostname',
        'host', 'port', 
        'path',
        'pathname',
        'query', 'search',
        'hash'
      ]), {
      protocol: outgoing.port === 80 ? 'http' : outgoing.port === 443 ? 'https' : undefined,
      pathname: outgoing.pathname ||  outgoing.path
    });

    var cacheKey = url.parse(url.format(outgoing)).href;

    return cacheKey;
  }

  var proxy = httpProxy.createProxyServer(options.proxy);

  var cache = options.cache;


  var promisifiedGet = Promise.promisify(cache.get.bind(cache)); 
  var getFromCache = function(cacheKey) {
    return promisifiedGet(cacheKey).then(function(data) {
      if (_.isUndefined(data)) {
        throw new Error('no data available for key '+cacheKey);
      }
      return data;
    });
  }

  proxy.on('error', function(err, req, res) {
    log('proxy error!', err);
  });

  proxy.on('proxyReq', function(proxyReq, req, res, options) {
    req.proxy = {
      proxyReq: proxyReq,
      options: options
    };

    log('proxying request', proxyReq.method, req.cacheKey);
  });

  proxy.on('proxyRes', function(proxyRes, req, res) {
    log('received response from upstream', req.proxy.proxyReq.method, req.cacheKey, proxyRes.statusCode, proxyRes.statusMessage);
    log('storing headers');

    var headersData =  _.pick(proxyRes, ['statusCode', 'statusMessage', 'headers']);
    cache.set('headers:'+req.cacheKey, headersData);


    var dataStream = proxyRes.headers['content-encoding'] ? proxyRes.pipe(zlib.createUnzip()) : proxyRes;

    var data = [];

    dataStream.on('data', function(chunk) {
      data.push(chunk);
    });

    dataStream.on('end', function() {
      data = Buffer.concat(data).toString();
      log('storing response for %s', req.cacheKey);
      cache.set(req.cacheKey, data);
    });
  });

  return function (req, res, next) {

    var cacheKey = req.cacheKey = cacheResolver(req);

    var headersCacheKey = 'headers:'+cacheKey;

    req.cache = {};

    getFromCache(headersCacheKey).then(function(data) {
      log('retrieved %s from cache', headersCacheKey);
      _.assign(req.cache, data);
    }).then(function() {
      return getFromCache(cacheKey);
    }).then(function(data) {
      log('retrieved %s from cache', cacheKey);

      var headers = _.omit(req.cache.headers, ['date', 'content-encoding'])

      res.status(req.cache.statusCode);

      log(headers);

      res.set(headers);
      res.end(data);
    }).caught(function(err) {
      log(err.message);
      proxy.web(req, res);
    }).caught(next);

  };

};
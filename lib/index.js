'use strict';

var url = require('url');

var _ = require('lodash');
var Promise = require('bluebird');
var debug = require('debug');
var zlib = require('zlib');
var fresh = require('fresh');

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

    var target = url.parse(options.proxy.target);
    var outgoing = setupOutgoing({},
      _.assign(options.proxy, {
        target: target
      }), req);

    outgoing = _.pick(outgoing, [
      // https://nodejs.org/docs/v4.4.2/api/url.html
      'protocol', 'slashes',
      'auth',
      'hostname',
      'host', 'port', 
      'path',
      'pathname',
      'query', 'search',
      'hash'
    ]);

    target = _.omit(target, [
      'path',
      'pathname'
    ]);

    // log('proxy target', target);
    // log('outgoing', outgoing);

    outgoing = _.defaults(outgoing, target, {
        protocol: outgoing.port === 80 ? 'http' : outgoing.port === 443 ? 'https' : undefined,
        pathname: outgoing.pathname ||  outgoing.path
    });

    // convert back into URL object
    outgoing = url.parse(url.format(outgoing));

    return _.get(outgoing, 'href');
  }

  var proxy = httpProxy.createProxyServer(options.proxy);

  var cache = options.cache;

  _.invoke(cache, 'store.events.on', 'redisError', function(err) {
    log(err);
  });

  var promisifiedGet = Promise.promisify(cache.get.bind(cache)); 
  var getFromCache = function(cacheKey) {
    return promisifiedGet(cacheKey).then(function(data) {
      if (_.isNil(data)) {
        throw new Error('no data available for key '+cacheKey);
      }
      return data;
    });
  };

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
      data = Buffer.concat(data).toString('base64');
      if (proxyRes.statusCode === 200) {
        log('storing %s response for %s', proxyRes.statusCode, req.cacheKey);
        cache.set(req.cacheKey, data);
      } else {
        log('not storing %s response for %s ', proxyRes.statusCode, req.cacheKey);
      }
    });
  });

  function cachedProxyMiddleware(req, res, next) {

    var cacheKey = req.cacheKey = cacheResolver(req);

    var headersCacheKey = 'headers:'+cacheKey;

    req.cache = {};

    var reqComplete = {complete: true};

    getFromCache(headersCacheKey).then(function(headersData) {

      log('retrieved %s from cache', headersCacheKey);

      _.assign(req.cache, headersData);

      var cachedEtag = _.get(headersData, 'headers.etag');
      var isFresh = fresh(req.headers, {
        'etag': cachedEtag
      });

      // TODO abstract `isFresh` as one of many validators
      // before returning `304` directly
      if (isFresh) {
        res.sendStatus(304);
        return reqComplete;
      }

      return headersData;

    }).then(function(headersData) {
      if (headersData === reqComplete) {
        return reqComplete;
      }

      return getFromCache(cacheKey);
    }).then(function(data) {

      if (data === reqComplete) {
        return reqComplete;
      }

      // redis returns a pseudo-buffer; create actual Buffer
      data = new Buffer(data, 'base64');

      log('retrieved %s from cache', cacheKey);

      var headers = _.omit(req.cache.headers, ['date', 'content-encoding', 'content-length']);

      res.status(req.cache.statusCode);

      // log(headers);

      res.set(headers);

      res.send(data).end();
    }).caught(function(err) {
      log(err.message);
      proxy.web(req, res);
    }).caught(next);

  }

  // expose proxy for further use,
  // e.g. upgrading web sockets
  cachedProxyMiddleware.proxy = proxy;

  // expose the cache
  cachedProxyMiddleware.cache = cache;

  cachedProxyMiddleware.options = options;

  return cachedProxyMiddleware;

};

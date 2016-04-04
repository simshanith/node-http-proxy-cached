'use strict';

var express = require('express');
var httpProxy = require('http-proxy');
var morgan = require('morgan');


var cacheManager = require('cache-manager');
var redisStore = require('cache-manager-redis');

var redisCache = cacheManager.caching({
    store: redisStore,
    return_buffers: true
});

var log = require('debug')('http-proxy-cached:example');

var cachingMiddlewareFactory = require('../');

var app = express();

app.use(morgan('dev'));

var router = express.Router();



router.use(cachingMiddlewareFactory({
  proxyTarget: 'http://localhost:8080/',
  cache: redisCache
}));

redisCache.store.events.on('redisError', function(err) {
  log(err);
});



app.use(router);

app.listen(1337);

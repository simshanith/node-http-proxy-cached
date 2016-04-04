'use strict';

var express = require('express');
var morgan = require('morgan');

var cacheManager = require('cache-manager');
var redisStore = require('cache-manager-redis');

var redisCache = cacheManager.caching({
    store: redisStore,
    return_buffers: true
});

var cachingMiddlewareFactory = require('../lib/');

var app = express();

app.use(morgan('dev'));

var router = express.Router();

router.use(cachingMiddlewareFactory({
  proxyTarget: 'http://localhost:8080/',
  cache: redisCache
}));

app.use(router);

app.listen(1337);

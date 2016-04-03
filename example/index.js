'use strict';

var express = require('express');
var httpProxy = require('http-proxy');
var cacheManager = require('cache-manager');

var cachingWrapper = require('../');

var app = express();

app.set('etag', 'strong');

var router = express.Router();

router.use(cachingWrapper({
  proxyTarget: 'http://placekitten.com/',
  cache: cacheManager.caching({})
}));

app.use(router);

app.listen(1337);

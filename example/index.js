'use strict';

var log = require('debug')('http-cached-proxy:example');

var express = require('express');
var morgan = require('morgan');

var cachingMiddlewareFactory = require('../lib/');
var cache = require('./cache');

var app = express();

app.use(morgan('dev'));

var router = express.Router();

var cachingMiddleware = cachingMiddlewareFactory({
  proxyTarget: 'http://localhost:8080/',
  cache: cache
});

router.use(cachingMiddleware);

app.use(router);

var server = app.listen(1337);
server.on('upgrade', function(req, socket, head) {
  cachingMiddleware.proxy.ws(req, socket, head);
});

server.on('listening', function() {
  var address = server.address();
  log('Server listening on port %s', address.port);
});

'use strict';

var express = require('express');
var morgan = require('morgan');

var cachingMiddlewareFactory = require('../lib/');
var cache = require('./cache');

var app = express();

app.use(morgan('dev'));

var router = express.Router();

router.use(cachingMiddlewareFactory({
  proxyTarget: 'http://localhost:8080/',
  cache: cache
}));

app.use(router);

app.listen(1337);

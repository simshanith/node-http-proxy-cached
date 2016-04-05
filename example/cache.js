'use strict';

var url = require('url');
var _ = require('lodash');

var cacheManager = require('cache-manager');
var redisStore = require('cache-manager-redis');


var redisUrl = url.parse(process.env.REDIS_URL || '');

redisUrl = {
  host: _.get(redisUrl, 'hostname'),
  port: _.get(redisUrl, 'port'),
  db: _.get(redisUrl, 'pathname', '').replace(/^\//, '')
};

var redisOptions = {
  return_buffers: true
};

var cacheOptions = _.assign({
  store: redisStore
}, redisUrl, redisOptions);

// cacheOptions = {};

module.exports = cacheManager.caching(cacheOptions);

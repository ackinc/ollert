const Redis = require("redis");

const config = require("../config");

const redis = Redis.createClient(config.cache.url);
redis.on("connect", () =>
  console.log(`Connected to cache at ${config.cache.url}`)
);
redis.on("error", (err) => {
  throw err;
});

module.exports = redis;

const Redis = require("redis");

const { REDIS_URL } = process.env;
const redis = Redis.createClient(REDIS_URL);
redis.on("connect", () => console.log(`Connected to cache at ${REDIS_URL}`));
redis.on("error", (err) => {
  throw err;
});

module.exports = redis;

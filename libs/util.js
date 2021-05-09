const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz123456789";
const N = ALPHABET.length;

function randomInt(low, high) {
  return low + Math.floor(Math.random() * (high - low));
}

function randomString(len) {
  let ret = "";
  for (let i = 0; i < len; i++) ret += ALPHABET.substr(randomInt(0, N), 1);
  return ret;
}

function stringToKeyValuePairs(s, sep, kvsep) {
  return s
    .split(sep)
    .map((kv) => kv.trim().split(kvsep))
    .reduce((acc, kv) => {
      acc[kv[0].trim()] = kv[1].trim();
      return acc;
    }, {});
}

function genericCallback(err) {
  if (err) console.error(err);
}

module.exports = {
  randomInt,
  randomString,
  stringToKeyValuePairs,
  genericCallback,
};

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz123456789";
const N = ALPHABET.length;

function randomInt(low, high) {
    return low + Math.floor(Math.random() * (high - low));
}

function randomString(len) {
    let ret = "";
    for (let i = 0; i < len; i++) ret += ALPHABET.substr(randomInt(0, N), 1);
    return ret;
}

module.exports = {
    randomInt: randomInt,
    randomString: randomString
};

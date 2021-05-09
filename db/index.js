const bcrypt = require("bcrypt");
const mongo_client = require("mongodb").MongoClient;

const config = require("../config");
const util = require("../libs/util");

const { DATABASE_NAME, DATABASE_URL } = process.env;
let db;
mongo_client.connect(
  DATABASE_URL,
  { useNewUrlParser: true, useUnifiedTopology: true },
  (err, client) => {
    if (err) throw err;
    db = client.db(DATABASE_NAME);
    console.log(`Connected to database at ${DATABASE_URL}`);
  }
);

function createUser(username, password, verified, cb = util.genericCallback) {
  bcrypt.hash(password, config.passwordSaltRounds, (err, password) => {
    if (err) cb(err);
    else
      db.collection("users").insertOne(
        {
          username,
          password,
          verified,
          boards: "[]",
        },
        cb
      );
  });
}

function getUser(username, cb = util.genericCallback) {
  db.collection("users").findOne({ username }, cb);
}

function updateUser(username, data, cb = util.genericCallback) {
  db.collection("users").updateOne({ username }, { $set: data }, cb);
}

module.exports = {
  getUser,
  createUser,
  updateUser,
};

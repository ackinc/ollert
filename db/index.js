const bcrypt = require("bcrypt");
const mongo_client = require("mongodb").MongoClient;

const config = require("../config");
const util = require("../libs/util");

let db;
mongo_client.connect(
  config.db.url,
  { useNewUrlParser: true },
  (err, client) => {
    if (err) throw err;
    db = client.db(config.db.dbname);
    console.log(
      `Connected to database at ${config.db.url}/${config.db.dbname}`
    );
  }
);

function createUser(username, password, verified, cb = util.genericCallback) {
  bcrypt.hash(password, config.bcrypt.rounds, (err, password) => {
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

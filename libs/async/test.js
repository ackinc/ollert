const async = require("./index");

function A(cb) {
  setTimeout(function () {
    console.log("A: ran after 3s");
    cb(null, "A");
  }, 3000);
}

function B(cb) {
  setTimeout(function () {
    console.log("B: ran after 1s");
    cb(null, "B");
  }, 1000);
}

async.parallel([A, B], (err, results) => {
  if (err) console.error(err);
  else console.log(results);
});

async.serial([A, B], (err, results) => {
  if (err) console.error(err);
  else console.log(results);
});

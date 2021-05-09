const fs = require("fs");
const path = require("path");

fs.readdirSync(__dirname)
  .filter(
    (filename) =>
      filename !== path.basename(__filename) && /controller\.js$/.test(filename)
  )
  .forEach((filename) =>
    Object.assign(exports, require(path.resolve(__dirname, filename)))
  );

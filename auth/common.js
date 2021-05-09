const jwt = require("jsonwebtoken");

const config = require("../config");

// we want to log the user in when:
//   1. user logs in explicitly (with fb/google/password)
//   2. user succesfully verified his/her email after registering with password
function handleLoginSuccess(payload, res) {
  jwt.sign(
    payload,
    process.env.JWT_KEY,
    { expiresIn: config.jwtExpirySecs },
    (err, token) => {
      if (err) {
        res.error(err, "Creating JWT token on login");
      } else {
        res.setHeader(
          "Set-Cookie",
          `token=${token}; Max-Age=${config.jwtExpirySecs}; Path=/`
        );
        res.json({ redirect_url: "/boards.html" });
      }
    }
  );
}

module.exports = { handleLoginSuccess };

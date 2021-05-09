require("dotenv").config();
const fs = require("fs");
const http = require("http");
const jwt = require("jsonwebtoken");
const path = require("path");

const async = require("./libs/async");
const auth = require("./auth");
const middleware = require("./libs/middleware");
const users = require("./users");

const URLS_REQUIRING_AUTHENTICATION = ["/api/me/boards"];

const { PORT } = process.env;
http
  .createServer(handleRequest)
  .listen(PORT, () => console.log(`Server is running on port ${PORT}`));

//////////////////////
// HELPER FUNCTIONS //
//////////////////////
function handleRequest(req, res) {
  res.error = sendServerErrorResponse;
  res.json = sendJSONResponse;
  res.redirect = sendRedirectResponse;
  res.sendFile = sendStaticFileResponse;

  let { method, url } = req;
  url = new URL(url, `http://${req.headers.host}`).pathname;
  if (url === "/") url = "/index.html";
  else if (url === "/reset_password") url = "/index.html";

  const is_auth_required = URLS_REQUIRING_AUTHENTICATION.indexOf(url) !== -1;
  const is_req_for_static_file = method === "GET" && !/^\/api\//.test(url);

  const asynctasks = [];
  asynctasks.push((cb) => middleware.processRequestQuery(req, cb));
  asynctasks.push((cb) => middleware.processRequestCookies(req, cb));
  asynctasks.push((cb) => middleware.processRequestBody(req, cb));

  async.parallel(asynctasks, (err) => {
    if (err) {
      res.error(err, `Pre-processing incoming request`);
    } else {
      decodeRequestToken(req, (err) => {
        if (err) {
          res.error(err, `Decoding JWT token`);
        } else if (is_auth_required && req.decoded === null) {
          // Bad token, so redirect to home
          // WARNING: this could cause some *bad* user experiences
          //   1. user is editing boards
          //   2. token expires before he is done
          //   3. user tries to save edits
          //   4. frontend redirects to home page on receiving 401 response
          //          since token has expired; edits lost!
          // Possible fix: extend expiry time of cookie and token every time they are
          //   successfully sent
          res.json({ error: "NOT_AUTHENTICATED" }, 401);
        } else if (req.url === "/index.html" && req.decoded !== null) {
          // if an already-logged-in user lands on the home page,
          //   redirect him to the boards page
          res.redirect("/boards.html");
        } else {
          continueHandlingRequest();
        }
      });
    }
  });

  function continueHandlingRequest() {
    if (is_req_for_static_file) {
      res.sendFile(`./static${url}`, {
        GOOGLE_ANALYTICS_ID: process.env.GOOGLE_ANALYTICS_ID,
      });
    } else if (method === "GET" && url === "/api/health_check") {
      res.json({ status: "OK" });
    } else if (method === "POST" && url === "/api/register") {
      auth.registerNewUser(req, res);
    } else if (method === "POST" && url === "/api/login") {
      auth.login(req, res);
    } else if (method === "GET" && url === "/api/resend_verification_email") {
      auth.resendVerificationEmailRequestHandler(req, res);
    } else if (method === "POST" && url === "/api/verify_email") {
      auth.emailVerificationRequestHandler(req, res);
    } else if (method === "GET" && url === "/api/forgot_password") {
      auth.forgotPasswordRequestHandler(req, res);
    } else if (method === "POST" && url === "/api/reset_password") {
      auth.resetPasswordRequestHandler(req, res);
    } else if (method === "GET" && url === "/api/me/boards") {
      users.retrieveBoards(req, res);
    } else if (method === "POST" && url === "/api/me/boards") {
      users.saveBoards(req, res);
    } else {
      res.json({ error: "PATH_NOT_FOUND" }, 404);
    }
  }
}

function decodeRequestToken(req, cb) {
  const token = req.cookie.token;
  if (!token) {
    req.decoded = null;
    process.nextTick(cb);
  } else {
    jwt.verify(token, process.env.JWT_KEY, (err, decoded) => {
      if (err) {
        cb(err);
      } else {
        req.decoded = decoded;
        cb();
      }
    });
  }
}

// functions to make sending responses easier
function sendServerErrorResponse(err, context) {
  this.statusCode = 500;
  this.setHeader("Content-Type", "application/json");
  this.end(JSON.stringify({ error: "SERVER_ERROR" }));

  console.error(`Error context: ${context}`);
  console.error(err);
}

function sendJSONResponse(body, status = 200) {
  this.statusCode = status;
  this.setHeader("Content-Type", "application/json");
  this.end(JSON.stringify(body));
}

function sendRedirectResponse(location) {
  this.statusCode = 302;
  this.setHeader("location", location);
  this.end();
}

function sendStaticFileResponse(filename, variables, status_code = 200) {
  const isHtmlFile = path.extname(filename) === ".html";

  fs.readFile(filename, (err, data) => {
    if (err && err.code === "ENOENT") {
      this.sendFile("./static/404.html", 404);
    } else if (err) {
      this.error(err, `Reading file from file system`);
    } else {
      if (isHtmlFile) {
        data = data.toString("utf-8");
        for (let v in variables) {
          data = data.replace(new RegExp(`%{{${v}}}`, "g"), variables[v]);
        }
      }

      this.statusCode = status_code;
      this.setHeader("Content-type", getMIMEType(filename));
      this.end(data);
    }
  });
}

function getMIMEType(filename) {
  const ext = path.extname(filename).substr(1); // remove the leading '.'
  switch (ext) {
    case "js":
      return `application/javascript`;
    case "html":
    case "css":
      return `text/${ext}`;
    case "jpg":
    case "jpeg":
    case "png":
    case "gif":
      return `image/${ext}`;
    default:
      throw new Error(
        "Asked for MIME type of file with unrecognized extension"
      );
  }
}

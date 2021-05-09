const db = require("../db");

function retrieveBoards(req, res) {
  const username = req.decoded.username;
  db.getUser(username, (err, user) => {
    if (err)
      res.error(
        err,
        `Retrieving user details from DB on receiving request for user's boards`
      );
    else if (!user) res.json({ error: "USER_NOT_FOUND" }, 400);
    else res.json({ boards: JSON.parse(user.boards) });
  });
}

function saveBoards(req, res) {
  const username = req.decoded.username;
  const boards = req.body.boards;
  db.updateUser(username, { boards: JSON.stringify(boards) }, (err) => {
    if (err) res.error(err, `Saving user's boards to DB`);
    else res.json({ message: "BOARDS_SAVED" });
  });
}

module.exports = {
  retrieveBoards,
  saveBoards,
};

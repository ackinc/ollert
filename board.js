function Board(name, lists) {
    this.name = name;
    this.lists = lists;
}

Boards.prototype.addBoard(name) {
    this.data.push({ title: name, lists: [] });
}

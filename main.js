const data = {};

const boards = document.getElementById('boards');
const new_board_elem = document.getElementById('new-board');
const new_board_elem_close_btn = new_board_elem.getElementsByClassName('close-btn')[0];
const new_board_elem_input = new_board_elem.getElementsByTagName('input')[0];
const create_board_elem = document.getElementById('create-board');

const lists = document.getElementById('lists');
const view_boards_btn = document.getElementById('view-boards');
const create_list_btn = document.getElementById('create-list');
const new_list_elem = document.getElementById('new-list');

new_board_elem_close_btn.onclick = hideNewBoardElem;
new_board_elem_input.onkeypress = newBoardElemInputHandler;
create_board_elem.onclick = showNewBoardElem;
view_boards_btn.onclick = function () {
    hideLists();
    showBoards();
}
create_list_btn.onclick = showNewListElem;

function showNewBoardElem() {
    new_board_elem.style.display = "flex";
    new_board_elem.getElementsByTagName('input')[0].focus();
}

function hideNewBoardElem() {
    new_board_elem.getElementsByTagName('input')[0].value = "";
    new_board_elem.style.display = "none";
}

function newBoardElemInputHandler(evt) {
    if (evt.key === "Enter") {
        const result = createBoard(new_board_elem_input.value);
        if (result) hideNewBoardElem();
        else alert('There is another board with the same name!');
    }
}

// String -> Boolean
// Tries to create a new board with the given name.
// If the name is already in use, returns false,
// else creates the board, and returns true.
// The newly created board is displayed in *front* of
//   the other boards already-created.
function createBoard(name) {
    if (data.hasOwnProperty(name)) return false;
    else {
        data[name] = {};

        const board = document.createElement('div');
        board.id = `board-${name}`;
        board.classList.add('board');
        board.onclick = function () {
            hideBoards();
            showLists(name);
        }

        const close = document.createElement('span');
        close.innerText = 'x';
        close.classList.add('close-btn');
        close.onclick = function (e) {
            closeBoardWithId(board.id);
            e.stopPropagation();
        };
        board.appendChild(close);

        const h1 = document.createElement('h1');
        h1.innerText = name;
        board.appendChild(h1);

        boards.insertBefore(board, new_board_elem.nextElementSibling);

        return true;
    }
}

// String -> Boolean
// closes the board with the given ID
function closeBoardWithId(id) {
    const name = id.substring(6); // removes the "board-" prefix from the id
    if (!data.hasOwnProperty(name)) {
        return false;
    } else {
        delete data[name];

        const board = document.getElementById(id);
        boards.removeChild(board);
        return true;
    }
}

function hideBoards() {
    boards.style.display = "none";
}

function showBoards() {
    boards.style.display = "grid";
}

function hideLists() {
    new_list_elem.getElementsByTagName('input')[0].value = "";
    new_list_elem.style.display = "none";

    // TODO: remove lists from #lists-lists
    lists.style.display = "none";
}

function showLists(board_name) {
    document.getElementById('board-name').innerText = board_name;

    // TODO: add lists associated with this board

    lists.style.display = "flex";
}

function showNewListElem() {
    new_list_elem.style.display = "flex";
    new_list_elem.getElementsByTagName('input')[0].focus();
    // TODO: get name of new list
    // TODO: add new list html to DOM
}

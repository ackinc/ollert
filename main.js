const boards = JSON.parse(localStorage.getItem('boards') || '[]');

const main_node = document.querySelector('main');
const create_board_html = `<div class="board create-board"><h1>Create Board...</h1></div>`;
const new_board_html = `<div class="board new-board"><input type="text" name="new-board-name" placeholder="Enter name..." /></div>`

document.addEventListener('DOMContentLoaded', (e) => showBoards(boards));
main_node.addEventListener('click', handleClick);

function showBoards(boards) {
    main_node.innerHTML = renderBoards(boards) + create_board_html;
}

function renderBoards(boards) {
    return boards.map(board => `<div class="board">
                                    <h1>${board.title}</h1>
                                    <div class="board-controls">
                                        <span class="edit-board">E</span>
                                        <span class="close-board">X</span>
                                    </div>
                                </div>`).join('');
}

function handleClick(e) {
    const target_class = e.target.className;
    if (target_class.includes('create-board') || e.target.parentNode.className.includes('create-board')) {
        createBoard();
    } else if (target_class.includes('edit-board')) {
        // TODO: allow user to change board name
    } else if (target_class.includes('close-board')) {
        closeBoard(e);
    } else if (target_class.includes('board')) {
        // TODO: show lists corresponding to board
    }
}

function createBoard() {
    boards.unshift({ title: 'Board Name...', lists: [] });
    showBoards(boards);

    // TODO: can we do better?
    document.querySelector('.board:first-child > h1').setAttribute('contentEditable', true);
}

function closeBoard(e) {
    const to_close = e.target.parentNode.parentNode;

    let idx = 0, cur = main_node.firstChild;
    while (cur !== to_close) {
        cur = cur.nextSibling;
        idx++;
    }

    main_node.removeChild(to_close);
    boards.splice(idx, 1);
}

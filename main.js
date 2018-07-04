const boards = JSON.parse(localStorage.getItem('boards') || '[]');

const main_node = document.querySelector('main');
const create_board_html = `<div class="board create-board"><h1>Create Board...</h1></div>`;
const new_board_html = `<form id="new-board-form" class="board">
                            <input type="text" name="board-name" placeholder="Enter name..." required autocomplete="off" />
                        </form>`

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
        showNewBoardForm();
    } else if (target_class.includes('edit-board')) {
        // TODO: allow user to change board name
    } else if (target_class.includes('close-board')) {
        closeBoard(e);
    } else if (target_class.includes('board')) {
        // TODO: show lists corresponding to board
    }
}

function showNewBoardForm() {
    if (main_node.querySelector('form#new-board-form') === null) {
        main_node.innerHTML = new_board_html + main_node.innerHTML;

        const form = main_node.querySelector('form');
        const input = form.querySelector('input[name="board-name"]');

        form.addEventListener('click', e => input.focus());
        form.addEventListener('submit', e => {
            createBoard(input.value)
            e.preventDefault();
        });

        // NOTE: clicking on "create board" when input is active leads to funny behaviour?
        input.addEventListener('blur', e => {
            if (e.explicitOriginalTarget !== form) hideNewBoardForm();
        });
        input.focus();
    }
}

function hideNewBoardForm() {
    const form = main_node.querySelector('form#new-board-form');
    if (form !== null) main_node.removeChild(form);
}

function createBoard(name) {
    boards.unshift({ title: name, lists: [] });
    localStorage.boards = JSON.stringify(boards);
    showBoards(boards);
}

function closeBoard(e) {
    // get a reference to the board that has to be removed
    const to_close = e.target.parentNode.parentNode;

    let idx = 0, cur = main_node.querySelector('.board');
    while (cur !== to_close) {
        cur = cur.nextSibling;
        idx++;
    }

    boards.splice(idx, 1);
    localStorage.boards = JSON.stringify(boards);
    main_node.removeChild(to_close);
}

const REGISTRATION_API_URL = '/api/register';
const LOGIN_API_URL = '/api/login';

const main_node = document.querySelector('main');
const all_sections = document.querySelectorAll('.user-action-section');
let cur_section;
showSection('login_section');

// displays the section having id <id>,while hiding other sections
function showSection(id) {
    all_sections.forEach(section => {
        if (section.id === id) {
            section.classList.remove('hide');
            section.querySelector('input').focus();
            cur_section = section;
        } else {
            section.classList.add('hide');
        }
    });
}

document.querySelectorAll('span.change-active-section').forEach(elem => {
    elem.addEventListener('click', function (e) {
        showSection(this.dataset.show);
    });
});

document.querySelector('form[name="registration_form"]').addEventListener('submit', function (e) {
    e.preventDefault();

    this.querySelector('.info').innerHTML = ``;
    this.querySelector('.error').innerHTML = ``;

    const username = this.querySelector('input[name="username"]').value;
    const pass = this.querySelector('input[name="password"]').value;
    const c_pass = this.querySelector('input[name="c_password"]').value;
    if (pass !== c_pass) {
        this.querySelector('.error').innerHTML = `Passwords don't match`;
        return;
    }

    fetch(REGISTRATION_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, password: pass })
    })
        .then(res => res.json())
        .then(body => {
            if (body.error) {
                this.querySelector('.error').innerHTML = body.error;
            } else {
                this.querySelector('.info').innerHTML = body.message;
            }
        })
        .catch(err => {
            this.querySelector('.error').innerHTML = `Network error.`;
        });
});

document.querySelector('form[name="login_form"]').addEventListener('submit', function (e) {
    e.preventDefault();

    this.querySelector('.info').innerHTML = ``;
    this.querySelector('.error').innerHTML = ``;

    const username = this.querySelector('input[name="username"]').value;
    const pass = this.querySelector('input[name="password"]').value;

    tryLogin({ username: username, password: pass });
});

function tryLogin(credentials) {
    fetch(LOGIN_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials)
    })
        .then(res => res.json())
        .then(handleLoginResponse)
        .catch(err => {
            cur_section.querySelector('.error').innerHTML = `Network error.`;
        });
}

function handleLoginResponse(body) {
    if (body.error) {
        cur_section.querySelector('.error').innerHTML = body.error;
    } else if (body.message === 'VERIFICATION_EMAIL_SENT') {
        cur_section.querySelector('.info').innerHTML = body.message;
    } else {
        document.location.replace('./boards.html');
    }
}

/* eslint-env browser */

const REGISTRATION_API_URL = "/api/register";
const LOGIN_API_URL = "/api/login";
const RESEND_VERIFICATION_EMAIL_API_URL = "/api/resend_verification_email";
const VERIFY_EMAIL_API_URL = "/api/verify_email";
const FORGOT_PASSWORD_API_URL = "/api/forgot_password";
const RESET_PASSWORD_API_URL = "api/reset_password";

const main_node = document.querySelector("main");
const all_sections = document.querySelectorAll(".user-action-section");
let cur_section;

const query_obj = util.parseQueryString(document.location.search.substr(1));
if (query_obj.username && query_obj.password_reset_code) {
  // user got here by clicking on the 'reset password' link we sent
  showSection("reset_password_section");
  cur_section.querySelector('input[name="username"]').value =
    query_obj.username;
  cur_section.querySelector('input[name="code"]').value =
    query_obj.password_reset_code;
} else {
  showSection("login_section");
}

// displays the section having id <id>,while hiding other sections
function showSection(id) {
  all_sections.forEach((section) => {
    if (section.id === id) {
      section.classList.remove("hide");

      const form = section.querySelector("form");
      if (form !== null) util.clearForm(form);

      section.querySelector("input").focus();
      cur_section = section;
    } else {
      section.classList.add("hide");
    }
  });
}

document.querySelectorAll("span.change-active-section").forEach((elem) => {
  elem.addEventListener("click", function (e) {
    showSection(this.dataset.show);
  });
});

document
  .querySelector("span.forgot-password")
  .addEventListener("click", function (e) {
    const username = cur_section.querySelector('input[name="username"]').value;
    const [errorbox, infobox] = clearErrorAndInfoBoxes();

    if (!username) {
      errorbox.innerHTML =
        'Please enter your email address above before clicking "forgot password"';
    } else {
      fetch(`${FORGOT_PASSWORD_API_URL}?username=${username}`)
        .then((res) => res.json())
        .then((body) => {
          if (body.error) {
            errorbox.innerHTML = body.error;
          } else {
            infobox.innerHTML = `An email containing a reset-password link has been sent to your inbox`;
          }
        })
        .catch((err) => {
          errorbox.innerHTML = "Network error";
          console.error(err);
        });
    }
  });

document
  .querySelector('form[name="registration_form"]')
  .addEventListener("submit", function (e) {
    e.preventDefault();

    this.querySelector(".info").innerHTML = ``;
    this.querySelector(".error").innerHTML = ``;

    const username = this.querySelector('input[name="username"]').value;
    const pass = this.querySelector('input[name="password"]').value;
    const c_pass = this.querySelector('input[name="c_password"]').value;
    if (pass !== c_pass) {
      this.querySelector(".error").innerHTML = `Passwords don't match`;
      return;
    }

    fetch(REGISTRATION_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username, password: pass }),
    })
      .then((res) => res.json())
      .then((body) => {
        if (body.error === "USERNAME_IN_USE") {
          this.querySelector(".error").innerHTML =
            "There is already an account with this email address. Please log in, or register with a different email.";
        } else if (body.error) {
          this.querySelector(".error").innerHTML = body.error;
        } else {
          showEmailVerificationSection(username);
        }
      })
      .catch((err) => {
        this.querySelector(".error").innerHTML = `Network error.`;
        console.error(err);
      });
  });

document
  .querySelector('form[name="login_form"]')
  .addEventListener("submit", function (e) {
    e.preventDefault();

    this.querySelector(".info").innerHTML = ``;
    this.querySelector(".error").innerHTML = ``;

    const username = this.querySelector('input[name="username"]').value;
    const pass = this.querySelector('input[name="password"]').value;

    tryLogin({ username: username, password: pass });
  });

function tryLogin(credentials) {
  fetch(LOGIN_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(credentials),
  })
    .then((res) => res.json())
    .then((body) => {
      if (body.error) {
        cur_section.querySelector(".error").innerHTML = body.error;
      } else if (body.message === "VERIFICATION_EMAIL_SENT") {
        showEmailVerificationSection(credentials.username);
      } else {
        document.location.replace("./boards.html");
      }
    })
    .catch((err) => {
      cur_section.querySelector(".error").innerHTML = `Network error.`;
    });
}

function showEmailVerificationSection(email) {
  showSection("email_verification_section");

  cur_section.querySelector(".error").innerHTML = "";
  cur_section.querySelector(".info").innerHTML =
    "A verification email has been sent to your inbox. Please enter the verification code and submit the form.";
  cur_section.querySelector('input[name="email"]').value = email;
}

document
  .querySelector('form[name="email_verification_form"]')
  .addEventListener("submit", function (e) {
    e.preventDefault();

    const email = this.querySelector('input[name="email"]').value;
    const code = this.querySelector('input[name="code"]').value;

    tryEmailVerification(email, code);
  });

function tryEmailVerification(email, code) {
  fetch(VERIFY_EMAIL_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ email: email, code: code }),
  })
    .then((res) => res.json())
    .then((body) => {
      const [errorbox] = clearErrorAndInfoBoxes();

      if (body.error === "TOKEN_EXPIRED") {
        errorbox.innerHTML =
          'Your code has expired. Please use the "resend verification email" feature below to get another code.';
      } else if (body.error) {
        errorbox.innerHTML = body.error;
      } else {
        document.location.replace("./boards.html");
      }
    })
    .catch((err) => {
      errorbox.innerHTML = "Network error.";
      console.error(err);
    });
}

document
  .querySelector("#email_verification_section span.resend_verification_email")
  .addEventListener("click", function (e) {
    resendVerificationEmail(
      cur_section.querySelector('input[name="email"]').value
    );
  });

function resendVerificationEmail(email) {
  const [errorbox, infobox] = clearErrorAndInfoBoxes();

  fetch(`${RESEND_VERIFICATION_EMAIL_API_URL}?email=${email}`)
    .then((res) => res.json())
    .then((body) => {
      if (body.error) {
        errorbox.innerHTML = body.error;
      } else {
        infobox.innerHTML = "Email sent. Please check your inbox.";
      }
    })
    .catch((err) => {
      errorbox.innerHTML = "Network error";
      console.error(err);
    });
}

document
  .querySelector('form[name="reset_password_form"]')
  .addEventListener("submit", function (e) {
    e.preventDefault();

    const username = cur_section.querySelector('input[name="username"]').value;
    const code = cur_section.querySelector('input[name="code"]').value;
    const password = cur_section.querySelector('input[name="password"]').value;
    const c_password = cur_section.querySelector('input[name="c_password"]')
      .value;

    if (password !== c_password) {
      cur_section.querySelector(".error").innerHTML = `Passwords don't match`;
    } else {
      const [errorbox] = clearErrorAndInfoBoxes();

      fetch(RESET_PASSWORD_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username,
          code: code,
          password: password,
        }),
      })
        .then((res) => res.json())
        .then((body) => {
          if (body.error) {
            errorbox.innerHTML = body.error;
          } else {
            showSection("login_section");
            cur_section.querySelector(".info").innerHTML =
              "Your password has been reset. Please log in.";
          }
        })
        .catch((err) => {
          errorbox.innerHTML = "Network error";
          console.error(err);
        });
    }
  });

function clearErrorAndInfoBoxes() {
  const errorbox = cur_section.querySelector(".error");
  const infobox = cur_section.querySelector(".info");
  errorbox.innerHTML = "";
  infobox.innerHTML = "";
  return [errorbox, infobox];
}

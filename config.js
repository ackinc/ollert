module.exports = {
  passwordSaltRounds: 12,
  emailTemplates: {
    passwordReset: {
      subject: "Ollert - reset your password",
      templatePath: "templates/reset_password.pug",
    },
    emailVerification: {
      subject: "Ollert - verify your email",
      templatePath: "templates/email_verification.pug",
    },
  },
  jwtExpirySecs: 86400 * 365 * 100,
  passwordReset: {
    tokenLength: 20,
    tokenExpiry: 15 * 60,
  },
  emailVerification: {
    tokenLength: 20,
    tokenExpiry: 15 * 60,
  },
};

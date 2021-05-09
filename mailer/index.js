const nodemailer = require("nodemailer");
const pug = require("pug");

const config = require("../config");
const util = require("../libs/util");

const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS } = process.env;
const mailTransporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});

function sendEmail(type, to, data, cb = util.genericCallback) {
  const html = pug.renderFile(config.emailTemplates[type].templatePath, data);
  const options = {
    from: process.env.EMAIL_FROM_ADDRESS,
    to: to,
    subject: config.emailTemplates[type].subject,
    html: html,
  };
  mailTransporter.sendMail(options, cb);
}

module.exports = { sendEmail };

const nodemailer = require('nodemailer');
const pug = require('pug');

const config = require('../config');
const util = require('../libs/util');

const mail_transporter = nodemailer.createTransport(config.email);

function sendEmail(type, to, data, cb = util.genericCallback) {
    const html = pug.renderFile(config.email_templates[type].template_path, data);
    const options = {
        from: config.email.auth.user,
        to: to,
        subject: config.email_templates[type].subject,
        html: html
    };
    mail_transporter.sendMail(options, cb);
}

module.exports = { sendEmail };

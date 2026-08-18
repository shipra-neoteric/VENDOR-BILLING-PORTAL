const nodemailer = require('nodemailer');

let transporter;

function getTransporter() {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 465);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port,
      secure: port === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

async function sendMail({ to, subject, text, attachments }) {
  return getTransporter().sendMail({
    from: process.env.SMTP_USER,
    to,
    subject,
    text,
    attachments,
  });
}

module.exports = { sendMail };

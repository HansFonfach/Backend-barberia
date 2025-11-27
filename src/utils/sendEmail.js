import nodemailer from "nodemailer";

export const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export default async function sendEmail({ to, subject, html }) {
  await transporter.sendMail({
    from: '"La Santa Barberia" <hans.fonfach@gmail.com>',
    to,
    subject,
    html,
  });
}

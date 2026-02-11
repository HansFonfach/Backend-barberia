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

export async function sendReservationEmail({ to, nombre, fecha, servicio }) {
  try {
    const html = `
      <h2>Reserva confirmada 💈</h2>
      <p>Hola <b>${nombre}</b>,</p>
      <p>Tu reserva fue creada exitosamente.</p>
      <ul>
        <li><b>Servicio:</b> ${servicio}</li>
        <li><b>Fecha:</b> ${fecha}</li>
      </ul>
      <p>¡Te esperamos!</p>
    `;

    return await transporter.sendMail({
      from: '"La Santa Barbería" <hans.fonfach@gmail.com>',
      to,
      subject: "Confirmación de reserva",
      html,
    });
  } catch (error) {
    console.error("❌ Error enviando email reserva:", error);
    // ❗ NO lanzar error para no romper la reserva
  }
}

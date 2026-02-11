import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export const enviarCorreo = async ({ to, subject, html }) => {
  try {
    const data = await resend.emails.send({
        from: '"La Santa Barberia" <hans.fonfach@gmail.com>',
      to,
      subject,
      html,
    });

    console.log("📧 Email enviado:", data);
    return data;
  } catch (error) {
    console.error("❌ Error al enviar correo:", error);
    throw new Error("No se pudo enviar el correo");
  }
};

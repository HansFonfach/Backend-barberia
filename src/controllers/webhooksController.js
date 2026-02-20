import WhatsAppService from "../services/whatsappService.js";
import Reserva from "../models/reserva.model.js";
import Usuario from "../models/usuario.model.js";

// Almacenamiento temporal para respuestas
const respuestasUsuarios = new Map();

export const enviarMensaje = async (req, res) => {
  try {
    // Twilio envía los datos así
    const { From, Body } = req.body;

    const numeroUsuario = From.replace("whatsapp:", "");
    const mensajeUsuario = Body.trim().toLowerCase();

   

    // Buscar usuario por teléfono en la base de datos
    const usuario = await Usuario.findOne({ telefono: numeroUsuario });

    if (!usuario) {
    
      return res.type("text/xml").send(`
        <Response>
          <Message>Lo sentimos, no encontramos tus reservas. Contacta a la barbería.</Message>
        </Response>
      `);
    }

    // Buscar reserva activa para hoy
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    const reserva = await Reserva.findOne({
      usuario: usuario._id,
      fecha: { $gte: hoy },
      estado: { $in: ["pendiente", "confirmada"] }
    })
    .populate("barbero", "nombre");

    if (!reserva) {
    
      await WhatsAppService.client.messages.create({
        body: "No encontramos reservas activas para hoy. Si crees que es un error, contacta a la barbería.",
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        to: `whatsapp:${numeroUsuario}`,
      });
      
      return res.type("text/xml").send(`
        <Response>
          <Message>No se encontraron reservas activas.</Message>
        </Response>
      `);
    }

    let respuesta = "";
    let mensajeRespuesta = "";

    // Procesar respuesta
    if (mensajeUsuario.includes("✅") || mensajeUsuario.includes("sí") || mensajeUsuario.includes("si")) {
      respuesta = "confirmar";
      
      // Actualizar reserva en base de datos
      reserva.estado = "confirmada";
      reserva.confirmacionUsuario = true;
      reserva.fechaConfirmacion = new Date();
      await reserva.save();
      
      mensajeRespuesta = `¡Gracias por confirmar, ${usuario.nombre}! 💈✂️\n\nTe esperamos hoy a las ${reserva.hora} con ${reserva.barbero.nombre}.`;
      
    
      
    } else if (mensajeUsuario.includes("❌") || mensajeUsuario.includes("no")) {
      respuesta = "cancelar";
      
      // Actualizar reserva en base de datos
      reserva.estado = "cancelada";
      reserva.motivoCancelacion = "Usuario canceló vía WhatsApp";
      await reserva.save();
      
      mensajeRespuesta = `Entendido, ${usuario.nombre}. Hemos cancelado tu reserva de hoy a las ${reserva.hora}.\n\n¡Esperamos verte pronto en la barbería! 💈`;
      
     
      
    } else {
      respuesta = "indeterminada";
      mensajeRespuesta = "Por favor responde con ✅ para confirmar o ❌ para cancelar tu reserva.";
    }

    // Enviar mensaje de respuesta
    await WhatsAppService.client.messages.create({
      body: mensajeRespuesta,
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to: `whatsapp:${numeroUsuario}`,
    });

    // Guardar respuesta en memoria (para testing)
    respuestasUsuarios.set(numeroUsuario, {
      respuesta,
      timestamp: new Date(),
      mensaje: mensajeUsuario,
      usuario: usuario.nombre,
      reservaId: reserva._id
    });

   

    // Twilio espera este formato de respuesta
    res.type("text/xml");
    res.send(`
      <Response>
        <Message>¡Gracias por tu respuesta!</Message>
      </Response>
    `);
  } catch (error) {
    console.error("❌ Error en webhook:", error);
    res.status(500).send("Error interno");
  }
};

export const respuesta = async (req, res) => {
  try {
    const respuestas = Array.from(respuestasUsuarios.entries());
    res.json({
      success: true,
      total: respuestas.length,
      respuestas: respuestas.map(([telefono, data]) => ({
        telefono,
        ...data
      }))
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: "Error obteniendo respuestas" 
    });
  }
};
import reservaModel from "../models/reserva.model.js";
import suscripcionModel from "../models/suscripcion.model.js";
import Suscripcion from "../models/suscripcion.model.js";
import Usuario from "../models/usuario.model.js";
import Empresa from "../models/empresa.model.js";
import PlanSuscripcion from "../models/planSuscripcion.model.js";
import { checkSuscripcion } from "../utils/checkSuscripcion.js";
import { calcularEstadoPlanPersonalizado } from "../utils/calcularEstadoPlanPersonalizado.js";
import { sendSuscriptionActiveEmail } from "./mailController.js";

/* =======================================================
   🟢 Crear Suscripción
======================================================= */
export const crearSuscripcion = async (req, res) => {
  try {
    const SERVICIO_CORTE_BARBA_ID = "69934ce087e49726a2cd3da1";
    const { id } = req.params;
    const { tipoPlan, planId } = req.body;

    // 2️⃣ Usuario
    const usuario = await Usuario.findById(id);

    if (!usuario) {
      return res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      });
    }

    // 3️⃣ Validar suscripción activa
    const suscripcionActiva = await Suscripcion.findOne({
      usuario: usuario._id,
      empresa: usuario.empresa,
      activa: true,
    });

    if (suscripcionActiva) {
      return res.status(409).json({
        success: false,
        message: "El usuario ya tiene una suscripción activa",
      });
    }

    // 🔥 NUEVO: suscribir usando un plan creado desde la app (Gestión de
    // planes de suscripción), en vez de uno de los 4 tipos fijos de abajo.
    // Si viene planId, este es el único camino que se toma; el switch de
    // tipos viejos ni se evalúa.
    if (planId) {
      const empresaDoc = await Empresa.findById(usuario.empresa).select(
        "permiteSuscripcion",
      );
      if (!empresaDoc?.permiteSuscripcion) {
        return res.status(403).json({
          success: false,
          message: "Esta empresa no tiene habilitadas las suscripciones",
        });
      }

      const plan = await PlanSuscripcion.findOne({
        _id: planId,
        empresa: usuario.empresa,
        activo: true,
      });

      if (!plan) {
        return res.status(404).json({
          success: false,
          message: "El plan seleccionado no existe o ya no está disponible",
        });
      }

      const fechaInicioPlan = new Date();
      const fechaFinPlan = new Date();
      fechaFinPlan.setDate(fechaFinPlan.getDate() + plan.duracionDias);

      const nuevaConPlan = await Suscripcion.create({
        usuario: usuario._id,
        empresa: usuario.empresa,

        activa: true,

        fechaInicio: fechaInicioPlan,
        fechaFin: fechaFinPlan,

        historial: false,

        tipoPlan: "plan_personalizado",
        plan: plan._id,
        planSnapshot: {
          nombre: plan.nombre,
          precio: plan.precio,
          duracionDias: plan.duracionDias,
          cicloDias: plan.cicloDias,
          cantidadPorCiclo: plan.cantidadPorCiclo,
          serviciosPermitidos: plan.serviciosPermitidos,
          diasVisibilidadCalendario: plan.diasVisibilidadCalendario,
        },

        serviciosTotales: plan.cantidadPorCiclo,
        serviciosUsados: 0,
      });

      await Usuario.findByIdAndUpdate(usuario._id, {
        $inc: { puntos: 50 },
        $set: { suscrito: true },
      });

      sendSuscriptionActiveEmail(usuario.email, {
        nombreCliente: usuario.nombre,
        fechaInicio: fechaInicioPlan.toLocaleDateString("es-CL"),
        fechaFin: fechaFinPlan.toLocaleDateString("es-CL"),
        tipoPlan: plan.nombre,
      }).catch(console.error);

      return res.status(201).json({
        success: true,
        message: "Suscripción creada correctamente",
        data: nuevaConPlan,
      });
    }

    // ---- A partir de aquí, flujo viejo intacto (tipos fijos hardcodeados) ----

    // 1️⃣ Validar plan
    const planesPermitidos = [
      "creditos",
      "combo_visita_corte_barba",
      "padre_e_hijo",
      "barba",
    ];
    if (!planesPermitidos.includes(tipoPlan)) {
      return res.status(400).json({
        success: false,
        message: "Tipo de plan inválido",
      });
    }

    // 4️⃣ Configuración del plan
    let serviciosTotales = 2;
    let precio = 25000;

    switch (tipoPlan) {
      case "creditos":
        serviciosTotales = 2;
        precio = 25000;
        break;

      case "combo_visita_corte_barba":
        serviciosTotales = 2;
        precio = 40000;
        break;

      case "padre_e_hijo":
        serviciosTotales = 2;
        precio = 22000;
        break;

      case "barba":
        serviciosTotales = 4;
        precio = 40000;
        break;
    }

    // 5️⃣ Fechas
    const fechaInicio = new Date();

    const fechaFin = new Date();
    fechaFin.setDate(fechaFin.getDate() + 30);

    // 6️⃣ Crear suscripción
    const nueva = await Suscripcion.create({
      usuario: usuario._id,
      empresa: usuario.empresa,

      activa: true,

      fechaInicio,
      fechaFin,

      historial: false,

      tipoPlan,

      serviciosTotales,
      serviciosUsados: 0,
    });

    // 7️⃣ Actualizar usuario
    await Usuario.findByIdAndUpdate(usuario._id, {
      $inc: { puntos: 50 },
      $set: { suscrito: true },
    });

    // 8️⃣ Mail
    sendSuscriptionActiveEmail(usuario.email, {
      nombreCliente: usuario.nombre,
      fechaInicio: fechaInicio.toLocaleDateString("es-CL"),
      fechaFin: fechaFin.toLocaleDateString("es-CL"),
      tipoPlan,
    }).catch(console.error);

    return res.status(201).json({
      success: true,
      message: "Suscripción creada correctamente",
      data: nueva,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};

/* =======================================================
   🔴 Cancelar Suscripción
======================================================= */
export const cancelarSuscripcion = async (req, res) => {
  try {
    const { id } = req.params;

    const suscripcion = await Suscripcion.findOne({
      usuario: id,
      activa: true,
    });

    if (!suscripcion) {
      return res.status(404).json({
        success: false,
        message: "No se encontró una suscripción activa.",
      });
    }

    suscripcion.activa = false;
    suscripcion.historial = true;
    suscripcion.fechaFin = new Date();
    await suscripcion.save();

    await Usuario.findByIdAndUpdate(id, { suscrito: false });

    return res.status(200).json({
      success: true,
      message: "Suscripción cancelada correctamente.",
    });
  } catch (error) {
    console.error("Error al cancelar suscripción:", error);
    return res.status(500).json({
      success: false,
      message: "Error interno al cancelar la suscripción.",
    });
  }
};

/* =======================================================
   🟡 Estado suscripción para el cliente
======================================================= */
export const estadoSuscripcionCliente = async (req, res) => {
  try {
    const { userId } = req.params;
    const SERVICIO_COMBO_ID = "69934ce087e49726a2cd3da1";

    let suscripcion = await Suscripcion.findOne({
      usuario: userId,
      activa: true,
    });

    if (!suscripcion) {
      return res.json({ activa: false, msg: "Usuario sin suscripción" });
    }

    // 🔥 Venció por tiempo
    if (suscripcion.fechaFin < new Date()) {
      suscripcion.activa = false;
      suscripcion.historial = true;
      await suscripcion.save();
      await Usuario.findByIdAndUpdate(userId, { suscrito: false });
      return res.json({ activa: false, msg: "Suscripción vencida" });
    }

    // 🔥 NUEVO: suscripciones creadas a partir de un plan de la app (en vez
    // de uno de los 4 tipos fijos de siempre) usan su propio cálculo, que
    // soporta ciclos que se resetean (ej. "1 al mes, por 12 meses") sin
    // cortar la suscripción completa al agotar el mes.
    if (suscripcion.tipoPlan === "plan_personalizado") {
      const estado = await calcularEstadoPlanPersonalizado(suscripcion);

      if (!estado.activa) {
        suscripcion.activa = false;
        suscripcion.historial = true;
        await suscripcion.save();
        await Usuario.findByIdAndUpdate(userId, { suscrito: false });
        return res.json({
          activa: false,
          msg: estado.vencePorTiempo
            ? "Suscripción vencida"
            : "Suscripción agotada",
        });
      }

      return res.json({
        activa: true,
        tipoPlan: suscripcion.tipoPlan,
        nombrePlan: suscripcion.planSnapshot?.nombre,
        serviciosTotales: estado.cantidadPorCiclo,
        serviciosUsados: estado.serviciosUsadosCiclo,
        restantes: estado.restantes,
        cobrar: estado.restantes <= 0,
        cicloFin: estado.cicloFin,
      });
    }

    // ---- A partir de aquí, flujo viejo intacto (tipos fijos hardcodeados) ----

    // 🔥 Calcular servicios usados en tiempo real
    const esCombo = suscripcion.tipoPlan === "combo_visita_corte_barba";
    const esBarba = suscripcion.tipoPlan === "barba";
    const SERVICIO_BARBA_ID = "6993a5495dada31f33304c19";

    const reservas = await reservaModel
      .find({
        cliente: userId,
        fecha: {
          $gte: suscripcion.fechaInicio,
          $lte: suscripcion.fechaFin, // 👈 antes decía new Date()
        },
        estado: { $ne: "cancelada" },
      })
      .populate("servicio", "_id");

    let serviciosUsados = 0;
    for (const r of reservas) {
      if (esCombo) {
        if (r.servicio?._id?.toString() === SERVICIO_COMBO_ID) {
          serviciosUsados += 1;
        }
      } else if (esBarba) {
        if (r.servicio?._id?.toString() === SERVICIO_BARBA_ID) {
          serviciosUsados += 1;
        }
      } else {
        // creditos y padre_e_hijo
        serviciosUsados += r.duracion >= 120 ? 2 : 1;
      }
    }

    // 🔥 Venció por servicios agotados (solo reservas pasadas)
    if (serviciosUsados >= suscripcion.serviciosTotales) {
      suscripcion.activa = false;
      suscripcion.historial = true;
      await suscripcion.save();
      await Usuario.findByIdAndUpdate(userId, { suscrito: false });
      return res.json({ activa: false, msg: "Suscripción agotada" });
    }

    const restantes = suscripcion.serviciosTotales - serviciosUsados;

    return res.json({
      activa: true,
      tipoPlan: suscripcion.tipoPlan,
      serviciosTotales: suscripcion.serviciosTotales,
      serviciosUsados,
      restantes,
      cobrar: restantes <= 0,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ msg: "Error interno" });
  }
};
/* =======================================================
   🟣 Registrar uso de servicio (barbero usa esto)
======================================================= */
export const registrarUsoServicio = async (req, res) => {
  try {
    const { usuarioId } = req.body;

    let suscripcion = await Suscripcion.findOne({
      usuario: usuarioId,
      activa: true,
    });

    if (!suscripcion) {
      return res.status(404).json({
        success: false,
        message: "El usuario no tiene una suscripción activa.",
      });
    }

    // 🔥 Si ya venció → pasar a historial y desactivar
    if (suscripcion.fechaFin < new Date()) {
      suscripcion.activa = false;
      suscripcion.historial = true;
      await suscripcion.save();

      await Usuario.findByIdAndUpdate(usuarioId, { suscrito: false });

      return res.json({
        success: false,
        message: "La suscripción ya venció.",
        cobrar: true,
      });
    }

    // 🔥 Si ya usó todo → no permitir más
    if (suscripcion.serviciosUsados >= suscripcion.serviciosTotales) {
      return res.json({
        success: true,
        msg: "El usuario ya usó todos sus servicios.",
        cobrar: true,
      });
    }

    // Registrar uso
    suscripcion.serviciosUsados += 1;

    // 🔥 Si ahora llegó al límite → cerrar suscripción
    if (suscripcion.serviciosUsados >= suscripcion.serviciosTotales) {
      suscripcion.activa = false;
      suscripcion.historial = true;

      await Usuario.findByIdAndUpdate(usuarioId, { suscrito: false });
    }

    await suscripcion.save();

    return res.json({
      success: true,
      msg: "Servicio registrado.",
      cobrar: false,
      serviciosUsados: suscripcion.serviciosUsados,
      serviciosRestantes:
        suscripcion.serviciosTotales - suscripcion.serviciosUsados,
    });
  } catch (error) {
    console.error("Error al registrar uso:", error);
    return res.status(500).json({ success: false, message: "Error interno." });
  }
};

/* =======================================================
   🟢 Obtener suscripción activa (para dashboard del cliente)
======================================================= */
export const getSuscripcionActiva = async (req, res) => {
  try {
    const userId = req.usuario.id;
    const sus = await checkSuscripcion(userId);
    if (!sus) return res.json(null);

    // 🔥 NUEVO: mismo caso que en estadoSuscripcionCliente, para planes
    // creados desde la app en vez de los 4 tipos fijos de siempre.
    if (sus.tipoPlan === "plan_personalizado") {
      const estado = await calcularEstadoPlanPersonalizado(sus);
      return res.json({
        tipoPlan: sus.tipoPlan,
        nombrePlan: sus.planSnapshot?.nombre,
        fechaInicio: sus.fechaInicio,
        fechaFin: sus.fechaFin,
        serviciosTotales: estado.cantidadPorCiclo,
        serviciosUsados: estado.serviciosUsadosCiclo,
        cicloFin: estado.cicloFin,
      });
    }

    // ---- A partir de aquí, flujo viejo intacto (tipos fijos hardcodeados) ----

    const SERVICIO_COMBO_ID = "69934ce087e49726a2cd3da1";
    const esCombo = sus.tipoPlan === "combo_visita_corte_barba";
    const esBarba = sus.tipoPlan === "barba";
    const SERVICIO_BARBA_ID = "6993a5495dada31f33304c19";

    const reservas = await reservaModel
      .find({
        cliente: userId,
        fecha: {
          $gte: sus.fechaInicio,
          $lte: sus.fechaFin, // 👈 este ya está bien, no tocar
        },
        estado: { $ne: "cancelada" },
      })
      .populate("servicio", "_id");

    let serviciosUsados = 0;
    for (const r of reservas) {
      if (esCombo) {
        if (r.servicio?._id?.toString() === SERVICIO_COMBO_ID) {
          serviciosUsados += 1;
        }
      } else if (esBarba) {
        if (r.servicio?._id?.toString() === SERVICIO_BARBA_ID) {
          serviciosUsados += 1;
        }
      } else {
        // creditos y padre_e_hijo
        serviciosUsados += r.duracion >= 120 ? 2 : 1;
      }
    }

    return res.json({
      tipoPlan: sus.tipoPlan,
      fechaInicio: sus.fechaInicio,
      fechaFin: sus.fechaFin,
      serviciosTotales: sus.serviciosTotales,
      serviciosUsados,
    });
  } catch (e) {
    res.status(500).json({ message: "Error obteniendo suscripción activa" });
  }
};

export const listarSuscripciones = async (req, res) => {
  const { mes, anio, activas } = req.query;

  try {
    const filtro = { empresa: req.usuario.empresaId };

    if (mes !== undefined && anio !== undefined) {
      const inicio = new Date(anio, mes, 1);
      inicio.setHours(0, 0, 0, 0);
      const fin = new Date(anio, Number(mes) + 1, 0);
      fin.setHours(23, 59, 59, 999);
      filtro.fechaInicio = { $gte: inicio, $lte: fin };
    }

    if (activas === "true") {
      filtro.activa = true;
      filtro.fechaFin = { $gte: new Date() };
    }

    const suscripciones = await suscripcionModel
      .find(filtro)
      .populate("usuario", "nombre apellido rut email telefono")
      .sort({ fechaInicio: -1 });

    const SERVICIO_COMBO_ID = "69934ce087e49726a2cd3da1";
    const SERVICIO_BARBA_ID = "6993a5495dada31f33304c19";

    const suscripcionesConUso = await Promise.all(
      suscripciones.map(async (sus) => {
        // 🔥 NUEVO: planes creados desde la app usan su propio cálculo
        // (soporta ciclos, ej. el plan anual con reseteo mensual).
        if (sus.tipoPlan === "plan_personalizado") {
          const estado = await calcularEstadoPlanPersonalizado(sus);
          return {
            ...sus.toObject(),
            serviciosUsados: estado.serviciosUsadosCiclo,
            serviciosTotales: estado.cantidadPorCiclo,
          };
        }

        const esCombo = sus.tipoPlan === "combo_visita_corte_barba";
        const esBarba = sus.tipoPlan === "barba";

        const reservas = await reservaModel
          .find({
            cliente: sus.usuario._id,
            fecha: { $gte: sus.fechaInicio, $lte: sus.fechaFin }, // 👈 todo el período
            estado: { $in: ["completada", "confirmada"] }, // excluye canceladas
          })
          .populate("servicio", "_id");

        let serviciosUsados = 0;
        for (const r of reservas) {
          if (esCombo) {
            if (r.servicio?._id?.toString() === SERVICIO_COMBO_ID)
              serviciosUsados += 1;
          } else if (esBarba) {
            if (r.servicio?._id?.toString() === SERVICIO_BARBA_ID)
              serviciosUsados += 1;
          } else {
            serviciosUsados += r.duracion >= 120 ? 2 : 1;
          }
        }

        return { ...sus.toObject(), serviciosUsados };
      }),
    );

    res.json({ ok: true, suscripciones: suscripcionesConUso });
  } catch (error) {
    console.error("Error al listar suscripciones:", error);
    res.status(500).json({ message: error.message });
  }
};

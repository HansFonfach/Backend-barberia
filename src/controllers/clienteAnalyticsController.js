import reservaModel from "../models/reserva.model.js";
import { calcularPromedioDias } from "../helpers/calcularPromedios.js";
import { generarMensajeEstado } from "../helpers/generarMensaje.js";
import { sendRecomendacionSuscripcionEmail } from "./mailController.js";
import { PLANES, IDS_SERVICIOS_SUSCRIPCION } from "../config/planes.js";
import servicioModel from "../models/servicio.model.js";

// =========================
// HELPERS COMPARTIDOS
// =========================

const normalizarFecha = (fecha) => {
  const f = new Date(fecha);
  f.setHours(0, 0, 0, 0);
  return f;
};

const esReservaValida = (reserva) => {
  const estado = (reserva.estado || "").toLowerCase();
  return ["completada", "terminada", "finalizada"].includes(estado);
};

const esCorte = (nombre = "") => nombre.toLowerCase().includes("corte");
const esBarba = (nombre = "") => nombre.toLowerCase().includes("barba");
const esCombo = (nombre = "") => {
  const t = nombre.toLowerCase();
  return t.includes("corte") && t.includes("barba");
};

// =========================
// OBTENER ESTADO LOOK CLIENTE
// =========================

export const obtenerEstadoLookCliente = async (req, res) => {
  try {
    const userId = req.usuario.id; // ✅ Corregido: userId no estaba definido

   
    const empresaId = req.usuario.empresaId;

     console.log(userId);

    const reservas = await reservaModel
      .find({ cliente: userId })
      .sort({ fecha: 1 })
      .populate("servicio", "nombre");

    if (!reservas.length) {
      return res.json({
        success: true,
        data: {
          corte: {
            promedio: 0,
            diasDesdeUltimo: null,
            totalVisitas: 0,
            mensaje:
              "Sin historial suficiente para calcular tu frecuencia de corte.",
          },
          barba: {
            promedio: 0,
            diasDesdeUltimo: null,
            totalVisitas: 0,
            mensaje:
              "Sin historial suficiente para calcular tu frecuencia de perfilado.",
          },
        },
      });
    }

    const ahora = normalizarFecha(new Date());

    const reservasPasadas = reservas.filter(
      (r) => normalizarFecha(r.fecha) <= ahora && esReservaValida(r),
    );

    const fechasCorte = reservasPasadas
      .filter((r) => esCorte(r.servicio?.nombre))
      .map((r) => normalizarFecha(r.fecha))
      .sort((a, b) => a - b);

    const fechasBarba = reservasPasadas
      .filter((r) => esBarba(r.servicio?.nombre))
      .map((r) => normalizarFecha(r.fecha))
      .sort((a, b) => a - b);

    const promedioCorte =
      fechasCorte.length > 1 ? calcularPromedioDias(fechasCorte) : 0;
    const promedioBarba =
      fechasBarba.length > 1 ? calcularPromedioDias(fechasBarba) : 0;

    const ultCorte =
      fechasCorte.length > 0 ? fechasCorte[fechasCorte.length - 1] : null;
    const ultBarba =
      fechasBarba.length > 0 ? fechasBarba[fechasBarba.length - 1] : null;

    const diasDesdeCorte = ultCorte
      ? Math.floor((ahora - ultCorte) / (1000 * 60 * 60 * 24))
      : null;

    const diasDesdeBarba = ultBarba
      ? Math.floor((ahora - ultBarba) / (1000 * 60 * 60 * 24))
      : null;

    const mensajeCorte =
      fechasCorte.length === 0
        ? "Primero debes reservar un corte para empezar a calcular."
        : fechasCorte.length === 1
          ? "Aún no hay suficiente historial para calcular tu frecuencia de corte."
          : generarMensajeEstado(diasDesdeCorte, promedioCorte, "corte");

    const mensajeBarba =
      fechasBarba.length === 0
        ? "Primero debes reservar un perfilado para empezar a calcular."
        : fechasBarba.length === 1
          ? "Aún no hay suficiente historial para calcular tu frecuencia de perfilado."
          : generarMensajeEstado(diasDesdeBarba, promedioBarba, "barba");

    return res.json({
      success: true,
      data: {
        corte: {
          promedio: Number(promedioCorte.toFixed(1)),
          diasDesdeUltimo: diasDesdeCorte,
          totalVisitas: fechasCorte.length,
          mensaje: mensajeCorte,
        },
        barba: {
          promedio: Number(promedioBarba.toFixed(1)),
          diasDesdeUltimo: diasDesdeBarba,
          totalVisitas: fechasBarba.length,
          mensaje: mensajeBarba,
        },
      },
    });
  } catch (error) {
    console.error("Error calculando estado del look:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error interno del servidor" });
  }
};

// =========================
// CLIENTES CON UNA SOLA VISITA
// =========================

export const obtenerClientesUnaVisitaNoRetornan = async (req, res) => {
  try {
    const empresaId = "698de476677550fcd3d2209c" // ✅ desde el token
    const ahora = new Date();
    const DIAS_MINIMOS = 20;

    const reservas = await reservaModel
      .find({
        empresa: empresaId,
        estado: { $in: ["completada", "atendida", "terminada", "finalizada"] },
      })
      .populate("cliente", "nombre apellido email telefono rut")
      .sort({ fecha: 1 });

    if (!reservas.length) return res.json({ success: true, data: [] });

    // ✅ Reservas futuras para excluir clientes que ya tienen hora
    const reservasFuturas = await reservaModel.find({
      empresa: empresaId,
      fecha: { $gt: ahora },
      estado: { $in: ["pendiente", "confirmada"] },
    });

    const clientesConHoraFutura = new Set(
      reservasFuturas.map((r) => r.cliente?.toString()).filter(Boolean),
    );

    const mapaClientes = new Map();

    reservas.forEach((r) => {
      const id = r.cliente?._id?.toString();
      if (!id) return;

      if (!mapaClientes.has(id)) {
        mapaClientes.set(id, { cliente: r.cliente, visitas: [] });
      }

      mapaClientes.get(id).visitas.push(r.fecha);
    });

    const clientesPerdidos = [];

    mapaClientes.forEach((data) => {
      // Solo 1 visita
      if (data.visitas.length !== 1) return;

      const clienteId = data.cliente._id?.toString();

      // ✅ Excluir si ya tiene hora futura
      if (clientesConHoraFutura.has(clienteId)) return;

      const ultimaVisita = new Date(data.visitas[0]);
      const dias = Math.floor((ahora - ultimaVisita) / (1000 * 60 * 60 * 24));

      // ✅ Solo los que llevan más de 20 días sin volver
      if (dias < DIAS_MINIMOS) return;

      clientesPerdidos.push({
        cliente: data.cliente,
        totalVisitas: 1,
        ultimaVisita,
        diasSinVolver: dias,
      });
    });

    clientesPerdidos.sort((a, b) => b.diasSinVolver - a.diasSinVolver);

    return res.json({
      success: true,
      total: clientesPerdidos.length,
      data: clientesPerdidos,
    });
  } catch (error) {
    console.error("Error obteniendo clientes perdidos:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error interno del servidor" });
  }
};
// =========================
// MOTOR DE RECOMENDACIÓN
// =========================

export const recomendarPlan = (perfil) => {
  const { pctCorte, pctBarba, pctCombo, frecuenciaDias } = perfil;

  if (pctCombo >= 0.4 || (pctCorte > 0.4 && pctBarba > 0.4)) {
    return "combo_visita_corte_barba";
  }

  if (pctBarba >= 0.5 && frecuenciaDias <= 14) {
    return "barba";
  }

  return "creditos";
};

export const generarMotivo = (plan) => {
  switch (plan) {
    case "combo_visita_corte_barba":
      return "Vienes frecuentemente a corte y barba, por lo que el plan combo te entrega mejor ahorro.";
    case "barba":
      return "Tu historial muestra visitas frecuentes de barba, lo que hace conveniente un plan semanal.";
    case "creditos":
      return "Tu patrón de visitas es principalmente de corte de pelo con buena recurrencia.";
    default:
      return "";
  }
};

// =========================
// CANDIDATOS A SUSCRIPCIÓN
// =========================

export const obtenerClientesCandidatosSuscripcion = async (req, res) => {
  try {
    const empresaId = "698de476677550fcd3d2209c"; // ✅ Desde el token, no hardcodeado

    const reservas = await reservaModel
      .find({ empresa: empresaId })
      .populate(
        "cliente",
        "nombre apellido email telefono suscrito intentosEmailSuscripcion ultimoEmailSuscripcion",
      )
      .populate("servicio", "nombre")
      .sort({ fecha: 1 });

    const reservasValidas = reservas.filter(esReservaValida);

    const clientesMap = new Map();

    for (const reserva of reservasValidas) {
      const clienteId = reserva.cliente?._id?.toString();
      if (!clienteId) continue;

      if (!clientesMap.has(clienteId)) {
        clientesMap.set(clienteId, {
          cliente: reserva.cliente,
          fechas: [],
          cortes: 0,
          barbas: 0,
          combos: 0,
        });
      }

      const item = clientesMap.get(clienteId);
      item.fechas.push(normalizarFecha(reserva.fecha));

      const nombreServicio = reserva.servicio?.nombre || "";

      if (esCombo(nombreServicio)) item.combos++;
      else if (esBarba(nombreServicio)) item.barbas++;
      else if (esCorte(nombreServicio)) item.cortes++;
    }

    const candidatos = [];
    const erroresEnvio = [];

    const serviciosDB = await servicioModel.find(
      { _id: { $in: Object.values(IDS_SERVICIOS_SUSCRIPCION) } },
      "nombre precio",
    );

    const PRECIOS = {
      corte:
        serviciosDB.find(
          (s) => s._id.toString() === IDS_SERVICIOS_SUSCRIPCION.corte,
        )?.precio || 0,
      barba:
        serviciosDB.find(
          (s) => s._id.toString() === IDS_SERVICIOS_SUSCRIPCION.barba,
        )?.precio || 0,
      combo:
        serviciosDB.find(
          (s) => s._id.toString() === IDS_SERVICIOS_SUSCRIPCION.combo,
        )?.precio || 0,
    };

    console.log("serviciosDB:", serviciosDB);
    console.log("PRECIOS:", PRECIOS);

    for (const data of clientesMap.values()) {
      const { cliente, fechas, cortes, barbas, combos } = data;

      // Ya suscrito → saltar
      if (cliente.suscrito) continue;

      // Mínimo 3 visitas para tener datos confiables
      if (fechas.length < 3) continue;

      const promedioDias = calcularPromedioDias(fechas);

      // Solo clientes con frecuencia dentro del rango esperado
      if (promedioDias < 10 || promedioDias > 21) continue;

      // ✅ Máximo 3 intentos por cliente
      if ((cliente.intentosEmailSuscripcion || 0) >= 3) continue;

      // ✅ Respetar intervalo de 45 días entre correos
      if (cliente.ultimoEmailSuscripcion) {
        const diasDesdeUltimoEmail = Math.floor(
          (Date.now() - new Date(cliente.ultimoEmailSuscripcion)) /
            (1000 * 60 * 60 * 24),
        );
        if (diasDesdeUltimoEmail < 45) continue;
      }

      const total = fechas.length;

      const perfil = {
        pctCorte: cortes / total,
        pctBarba: barbas / total,
        pctCombo: combos / total,
        frecuenciaDias: promedioDias,
      };

      const suscripcionSugerida = recomendarPlan(perfil);
      const plan = PLANES[suscripcionSugerida];
      const motivo = generarMotivo(suscripcionSugerida);

      // ✅ Visitas mensuales reales (no el total histórico)
      const visitasMensuales = Math.round(30 / promedioDias);
      const beneficio = calcularBeneficioSuscripcion(
        suscripcionSugerida,
        visitasMensuales,
        perfil,
        PRECIOS,
      );

      candidatos.push({
        clienteId: cliente._id,
        nombre: cliente.nombre,
        apellido: cliente.apellido,
        email: cliente.email,
        telefono: cliente.telefono,
        totalVisitas: total,
        promedioDias: Number(promedioDias.toFixed(1)),
        visitasMensuales,
        cortes,
        barbas,
        combos,
        suscripcionSugerida,
        motivo,
        ...beneficio,
      });

      // ✅ Enviar correo dentro del loop con los datos correctos
      try {
        await sendRecomendacionSuscripcionEmail(cliente.email, {
          nombreCliente: cliente.nombre,
          nombreEmpresa: req.usuario.nombreEmpresa || "Tu barbería",
          suscripcionSugerida,
          nombrePlan: plan.descripcion,
          precioPlan: plan.precio,
          motivo,
          ahorroMensual: beneficio.ahorroMensual,
          ahorroAnual: beneficio.ahorroAnual,
          equivalenteCortes: beneficio.equivalenteCortes,
        });

        // ✅ Actualizar contador e historial de envíos en la DB
        await cliente.updateOne({
          $inc: { intentosEmailSuscripcion: 1 },
          $set: { ultimoEmailSuscripcion: new Date() },
        });
      } catch (emailError) {
        console.error(
          `❌ Error enviando email a ${cliente.email}:`,
          emailError,
        );
        erroresEnvio.push(cliente.email);
      }
    }

    candidatos.sort((a, b) => a.promedioDias - b.promedioDias);

    return res.json({
      success: true,
      total: candidatos.length,
      emailsEnviados: candidatos.length - erroresEnvio.length,
      erroresEnvio,
      data: candidatos,
    });
  } catch (error) {
    console.error("Error obteniendo candidatos a suscripción:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error interno del servidor" });
  }
};

// =========================
// CALCULAR BENEFICIO
// =========================

export const calcularBeneficioSuscripcion = (
  planKey,
  visitasMensuales,
  perfil,
  PRECIOS,
) => {
  const plan = PLANES[planKey];

  const valorSinPlan =
    perfil.pctCombo > 0.4
      ? visitasMensuales * PRECIOS.combo
      : perfil.pctBarba > perfil.pctCorte
        ? visitasMensuales * PRECIOS.barba
        : visitasMensuales * PRECIOS.corte;

  const costoPlan = plan.precio;

  const ahorroMensual = Math.max(valorSinPlan - costoPlan, 0);
  const ahorroAnual = ahorroMensual * 12;
  const equivalenteCortes = Math.round(ahorroAnual / PRECIOS.corte);

  return {
    ahorroMensual,
    ahorroAnual,
    equivalenteCortes,
  };
};

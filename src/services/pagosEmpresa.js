// services/pagosEmpresa.js
//
// Registrar un pago de la mensualidad de AgendaFonfach. Antes vivía dentro
// de superAdminController.registrarPago; se movió acá tal cual para usar la
// MISMA lógica cuando el pago llega solo por Mercado Pago:
//  - suma el pago al historial y deja el último pago en hoy;
//  - calcula el próximo pago (desde el cobro pendiente o el día de pago);
//  - si estaba suspendida, la reactiva;
//  - cierra el cobro pendiente (PagoEmpresa) y deja creado el del mes siguiente,
//    para que el cron de avisos siga funcionando solo;
//  - manda el correo de "pago acreditado".
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import Empresa from "../models/empresa.model.js";
import PagoEmpresa from "../models/pagoEmpresa.model.js";
import { sendPagoAcreditadoEmail } from "../controllers/mailController.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const ZONA_PAGOS = "America/Santiago";

export class ErrorPago extends Error {
  constructor(mensaje, status = 400) {
    super(mensaje);
    this.status = status;
  }
}

/**
 * @returns {{ empresa, correo, proximoCobro }}
 */
export const aplicarPagoEmpresa = async (empresaId, { monto, notas, enviarCorreo = true, metodo = "transferencia" } = {}) => {
  const empresa = await Empresa.findById(empresaId);
  if (!empresa) throw new ErrorPago("Empresa no encontrada", 404);

  const montoFinal = monto !== undefined ? Number(monto) : empresa.cuotaMensual;
  if (!montoFinal || Number.isNaN(montoFinal) || montoFinal <= 0) {
    throw new ErrorPago("Monto de pago inválido", 400);
  }

  const ahora = new Date();
  empresa.historialPagos.push({ fecha: ahora, monto: montoFinal, notas: notas || "" });
  empresa.ultimoPago = ahora;

  // Cobro pendiente más antiguo de este negocio (colección PagoEmpresa, la
  // que lee el cron de correos). Se busca ANTES de calcular el próximo pago
  // porque el próximo vencimiento se cuenta desde ese cobro: si vencía el 5
  // de octubre, el siguiente es el 5 de noviembre, pague el día que pague.
  let cobroPendiente = null;
  try {
    cobroPendiente = await PagoEmpresa.findOne({
      empresa: empresa._id,
      estado: { $in: ["pendiente", "atrasado"] },
    }).sort({ fechaVencimiento: 1 });
  } catch (err) {
    console.error("No se pudo buscar el cobro pendiente (PagoEmpresa):", err.message);
  }

  // Próximo pago:
  //  1) si había un cobro pendiente y "vencimiento + 1 mes" cae en el futuro,
  //     ese es el próximo (mantiene el día de cobro de siempre);
  //  2) si no, mismo día del mes (fechaPago) del mes siguiente si está
  //     configurado, o +30 días desde hoy.
  let proximo = null;
  if (cobroPendiente?.fechaVencimiento) {
    const candidato = dayjs(cobroPendiente.fechaVencimiento)
      .tz(ZONA_PAGOS)
      .add(1, "month")
      .hour(12)
      .minute(0)
      .second(0)
      .millisecond(0);
    if (candidato.isAfter(dayjs())) proximo = candidato.toDate();
  }
  if (!proximo) {
    proximo = new Date(ahora);
    if (empresa.fechaPago) {
      proximo.setMonth(proximo.getMonth() + 1);
      proximo.setDate(Math.min(empresa.fechaPago, 28));
    } else {
      proximo.setDate(proximo.getDate() + 30);
    }
  }
  empresa.proximoPago = proximo;

  // Si estaba suspendida por no pago, un pago registrado la reactiva sola.
  // Si estaba en prueba, pasa a plan pagado.
  const estabaSuspendida = ["suspendido", "cancelado"].includes(empresa.estadoSuscripcion);
  if (estabaSuspendida) {
    empresa.estadoSuscripcion = "activo";
    empresa.suspendidaDesde = null;
    empresa.motivoSuspension = "";
  }
  if (empresa.estadoSuscripcion === "trial" && metodo !== "transferencia") {
    empresa.estadoSuscripcion = "activo";
    empresa.plan = "activo";
    if (empresa.trial) empresa.trial.activo = false;
  }

  await empresa.save();

  // Cobros en PagoEmpresa (lo que usa el cron de correos automáticos).
  // "Best effort": el pago ya quedó guardado arriba.
  //  1) El cobro pendiente más antiguo se cierra como pagado.
  //  2) Se deja cargado el cobro del próximo mes, con los avisos en false.
  let proximoCobro = { creado: false, fecha: null };
  try {
    if (cobroPendiente) {
      cobroPendiente.estado = "pagado";
      cobroPendiente.fechaPago = ahora;
      if (!cobroPendiente.monto) cobroPendiente.monto = montoFinal;
      await cobroPendiente.save();
    }

    const diaProximo = dayjs(proximo).tz(ZONA_PAGOS).format("YYYY-MM-DD");
    const abiertos = await PagoEmpresa.find({
      empresa: empresa._id,
      estado: { $in: ["pendiente", "atrasado"] },
    });
    const yaExiste = abiertos.some((p) => dayjs(p.fechaVencimiento).tz(ZONA_PAGOS).format("YYYY-MM-DD") === diaProximo);

    if (!yaExiste) {
      const vence = dayjs.tz(`${diaProximo} 12:00`, "YYYY-MM-DD HH:mm", ZONA_PAGOS);
      // Misma convención que los cobros que ya había: "mes" es el mes del
      // vencimiento menos 1 (vence 06-09 → mes 8). En enero pasa a 12 del año anterior.
      const mes = vence.month() === 0 ? 12 : vence.month();
      const anio = vence.month() === 0 ? vence.year() - 1 : vence.year();

      await PagoEmpresa.create({
        empresa: empresa._id,
        mes,
        anio,
        monto: empresa.cuotaMensual || montoFinal,
        estado: "pendiente",
        fechaVencimiento: vence.toDate(),
        metodoPago: "transferencia",
        observacion: "Cobro del mes siguiente, creado al marcar el pago anterior",
        notificaciones: {
          diasAntes5: false,
          diasAntes2: false,
          diasAntes1: false,
          diaVencimiento: false,
          diasDespues3: false,
        },
      });
      proximoCobro = { creado: true, fecha: vence.toDate() };
    }
  } catch (err) {
    console.error("No se pudo actualizar los cobros (PagoEmpresa):", err.message);
  }

  // Correo de "pago acreditado". Un fallo acá nunca deshace el pago.
  let correo = { enviado: false, destino: null, motivo: "" };
  if (enviarCorreo !== false) {
    if (!empresa.correo) {
      correo.motivo = "El negocio no tiene un correo registrado";
    } else {
      try {
        const resultado = await sendPagoAcreditadoEmail(empresa, {
          monto: montoFinal,
          fechaPago: ahora,
          proximoPago: proximo,
          reactivada: estabaSuspendida,
        });
        if (resultado?.error) {
          throw new Error(resultado.error.message || "Error del proveedor de correo");
        }
        correo = { enviado: true, destino: empresa.correo, motivo: "" };
      } catch (err) {
        console.error("Error enviando correo de pago acreditado:", err.message);
        correo.motivo = "No se pudo enviar el correo";
      }
    }
  } else {
    correo.motivo = "Envío de correo desactivado para este pago";
  }

  return { empresa, correo, proximoCobro };
};

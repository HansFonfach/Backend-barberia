// utils/linkPagoPlan.js
//
// Link para que un negocio pague su mensualidad de AgendaFonfach sin iniciar
// sesión (sirve aunque esté suspendido, que es justo cuando más se necesita):
//   https://www.agendafonfach.cl/pagar-plan/<token>
// El token está firmado con TOKEN_SECRET y solo permite ver el plan de ESE
// negocio y pagarlo. Va en los correos de cobro, en "Mi plan" del panel y el
// super-admin lo puede copiar para mandarlo por WhatsApp.
import jwt from "jsonwebtoken";
import { TOKEN_SECRET } from "../config.js";

const TIPO = "pago-plan";
const DURACION = "180d";

export const urlFrontend = () => (process.env.FRONTEND_URL || "https://www.agendafonfach.cl").replace(/\/+$/, "");

export const crearTokenPago = (empresaId) => jwt.sign({ e: String(empresaId), t: TIPO }, TOKEN_SECRET, { expiresIn: DURACION });

/** Devuelve el id de la empresa, o null si el token no sirve. */
export const leerTokenPago = (token) => {
  try {
    const datos = jwt.verify(String(token || ""), TOKEN_SECRET);
    return datos?.t === TIPO && datos.e ? datos.e : null;
  } catch {
    return null;
  }
};

export const linkPagoPlan = (empresaId) => `${urlFrontend()}/pagar-plan/${crearTokenPago(empresaId)}`;

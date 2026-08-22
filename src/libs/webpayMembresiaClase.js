// src/libs/webpayMembresiaClase.js
//
// Cliente de Transbank WebPay Plus para el pago online de mensualidades de
// clases grupales (gimnasio). Es un archivo aparte de src/libs/webpay.js
// (que ya existía para un intento viejo de pago de suscripción de
// barbería) para no tocar ni arriesgar nada de lo que ya había.
//
// Ambiente:
// - Por defecto usa el ambiente de INTEGRACIÓN (pruebas) de Transbank, con
//   las credenciales de prueba oficiales que trae el propio SDK
//   (IntegrationCommerceCodes.WEBPAY_PLUS / IntegrationApiKeys.WEBPAY). No
//   son un secreto: Transbank las publica para que cualquiera pueda
//   integrar y probar sin necesidad de ser comercio afiliado todavía. Con
//   esto, hoy, sin ningún dato tuyo, ya se pueden hacer pagos de prueba
//   (Transbank entrega tarjetas de prueba en su documentación).
//
// - Para pasar a cobros REALES más adelante, agrega en el .env:
//     TB_ENVIRONMENT=production
//     TB_COMMERCE_CODE=<código de comercio real que te da Transbank>
//     TB_API_KEY=<API Key Secret real que te da Transbank>
//   (TB_COMMERCE_CODE y TB_API_KEY ya existen como variables en el .env,
//   solo estaban sin usar). Sin TB_ENVIRONMENT=production, este archivo
//   siempre usa el ambiente de pruebas, así que es imposible cobrar plata
//   real por accidente mientras no se configure explícitamente.
import pkg from "transbank-sdk";
const {
  WebpayPlus,
  Options,
  Environment,
  IntegrationCommerceCodes,
  IntegrationApiKeys,
} = pkg;

const esProduccion = process.env.TB_ENVIRONMENT === "production";

if (esProduccion && (!process.env.TB_COMMERCE_CODE || !process.env.TB_API_KEY)) {
  console.error(
    "⚠️  TB_ENVIRONMENT=production pero falta TB_COMMERCE_CODE y/o TB_API_KEY en el .env. " +
      "Los pagos de membresías de clases van a fallar hasta que se configuren.",
  );
}

export const esAmbienteProduccionWebpay = esProduccion;

export const webpayMembresiaTx = new WebpayPlus.Transaction(
  esProduccion
    ? new Options(
        process.env.TB_COMMERCE_CODE,
        process.env.TB_API_KEY,
        Environment.Production,
      )
    : new Options(
        IntegrationCommerceCodes.WEBPAY_PLUS,
        IntegrationApiKeys.WEBPAY,
        Environment.Integration,
      ),
);

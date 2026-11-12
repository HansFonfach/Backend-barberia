// node --test test/giftcards.test.js
// Pruebas de giftcards sin base de datos (se simulan los modelos).
import { test } from "node:test";
import assert from "node:assert/strict";

const g = await import("../src/utils/giftcards.js");
const { default: GiftCard } = await import("../src/models/giftCard.model.js");
const { default: Reserva } = await import("../src/models/reserva.model.js");
const { default: Empresa } = await import("../src/models/empresa.model.js");
const { default: Servicio } = await import("../src/models/servicio.model.js");
const ctrl = await import("../src/controllers/giftcardController.js");

const EMPRESA = "6a888efabd25931ae0891ec8";
const SERV_CORTE = "64b0000000000000000000aa";
const SERV_BARBA = "64b0000000000000000000bb";
const futuro = new Date(Date.now() + 30 * 864e5);

const simular = ({ gc = null, usos = [] }) => {
  GiftCard.findOne = () => ({ lean: async () => gc });
  GiftCard.findById = () => ({ select: () => ({ lean: async () => gc }) });
  Reserva.find = () => ({ select: () => ({ lean: async () => usos }) });
};
const uso = (monto) => ({ giftcard: { montoAplicado: monto } });

test("código: formato GC-XXXX-XXXX sin letras confusas", () => {
  for (let i = 0; i < 50; i += 1) {
    const c = g.generarCodigoGiftcard();
    assert.match(c, /^GC-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
  }
});

test("normaliza lo que escribe el cliente", () => {
  assert.equal(g.normalizarCodigoGiftcard("gc 7k3p-x2mq"), "GC-7K3P-X2MQ");
  assert.equal(g.normalizarCodigoGiftcard("GC7K3PX2MQ"), "GC-7K3P-X2MQ");
  assert.equal(g.normalizarCodigoGiftcard("NAVIDAD20"), "");
  assert.equal(g.esCodigoGiftcard("DIADELPROFE"), false);
});

test("resumen: servicio usado / monto con saldo / vencida", () => {
  const serv = { tipo: "servicio", monto: 15000, estado: "activa", venceEn: futuro };
  assert.equal(g.resumenGiftcard(serv, []).estado, "activa");
  assert.equal(g.resumenGiftcard(serv, [uso(15000)]).estado, "usada");

  const monto = { tipo: "monto", monto: 20000, estado: "activa", venceEn: futuro };
  const r = g.resumenGiftcard(monto, [uso(12000)]);
  assert.equal(r.estado, "activa");
  assert.equal(r.saldo, 8000);
  assert.equal(g.resumenGiftcard(monto, [uso(12000), uso(8000)]).estado, "usada");

  const vencida = { ...monto, venceEn: new Date(Date.now() - 864e5) };
  assert.equal(g.resumenGiftcard(vencida, []).estado, "vencida");
  assert.equal(g.resumenGiftcard({ ...monto, estado: "pendiente" }, []).estado, "pendiente");
});

test("canje por servicio: cubre el servicio entero aunque haya subido de precio", async () => {
  simular({ gc: { _id: "g1", codigo: "GC-AAAA-BBBB", tipo: "servicio", servicio: SERV_CORTE, servicioNombre: "Corte", monto: 12000, estado: "activa", venceEn: futuro } });
  const r = await g.evaluarGiftcard({ empresaId: EMPRESA, codigo: "gcaaaabbbb", servicioId: SERV_CORTE, precioBase: 14000 });
  assert.equal(r.ok, true);
  assert.equal(r.descuento, 14000);
  assert.equal(r.precioFinal, 0);
});

test("canje por servicio: otro servicio o ya usada → rechazo con motivo", async () => {
  const gc = { _id: "g1", codigo: "GC-AAAA-BBBB", tipo: "servicio", servicio: SERV_CORTE, servicioNombre: "Corte", monto: 12000, estado: "activa", venceEn: futuro };
  simular({ gc });
  const otro = await g.evaluarGiftcard({ empresaId: EMPRESA, codigo: "GC-AAAA-BBBB", servicioId: SERV_BARBA, precioBase: 9000 });
  assert.equal(otro.ok, false);
  assert.match(otro.message, /Corte/);
  simular({ gc, usos: [uso(12000)] });
  const usada = await g.evaluarGiftcard({ empresaId: EMPRESA, codigo: "GC-AAAA-BBBB", servicioId: SERV_CORTE, precioBase: 12000 });
  assert.equal(usada.ok, false);
  assert.match(usada.message, /ya fue usada/);
});

test("canje por monto: descuenta hasta el saldo", async () => {
  const gc = { _id: "g2", codigo: "GC-CCCC-DDDD", tipo: "monto", monto: 20000, estado: "activa", venceEn: futuro };
  simular({ gc, usos: [uso(12000)] });
  const r = await g.evaluarGiftcard({ empresaId: EMPRESA, codigo: "GC-CCCC-DDDD", servicioId: SERV_BARBA, precioBase: 15000 });
  assert.equal(r.ok, true);
  assert.equal(r.descuento, 8000);
  assert.equal(r.precioFinal, 7000);
  assert.equal(r.saldoRestante, 0);
});

test("pendiente, anulada, vencida o inexistente → no sirve", async () => {
  const base = { _id: "g3", codigo: "GC-EEEE-FFFF", tipo: "monto", monto: 10000, venceEn: futuro };
  for (const [gc, re] of [
    [{ ...base, estado: "pendiente" }, /no es válida/],
    [{ ...base, estado: "anulada" }, /anulada/],
    [{ ...base, estado: "activa", venceEn: new Date("2026-01-01") }, /venció/],
    [null, /no es válida/],
  ]) {
    simular({ gc });
    const r = await g.evaluarGiftcard({ empresaId: EMPRESA, codigo: "GC-EEEE-FFFF", servicioId: SERV_BARBA, precioBase: 9000 });
    assert.equal(r.ok, false);
    assert.match(r.message, re);
  }
});

test("dos reservas al mismo tiempo con la misma giftcard: se detecta", async () => {
  simular({ gc: { tipo: "servicio", monto: 12000 }, usos: [uso(12000), uso(12000)] });
  assert.equal(await g.consumoGiftcardValido("g1"), false);
  simular({ gc: { tipo: "monto", monto: 20000 }, usos: [uso(12000), uso(8000)] });
  assert.equal(await g.consumoGiftcardValido("g2"), true);
  simular({ gc: { tipo: "monto", monto: 20000 }, usos: [uso(12000), uso(9000)] });
  assert.equal(await g.consumoGiftcardValido("g2"), false);
});

// Respuesta de express simulada
const respuesta = () => {
  const r = { statusCode: 200, body: null };
  r.status = (c) => ((r.statusCode = c), r);
  r.json = (b) => ((r.body = b), r);
  return r;
};

test("solicitud pública: valida monto, datos y comprobante", async () => {
  Empresa.findOne = async () => ({ _id: EMPRESA, slug: "demo", estado: "activo", giftcards: { activa: true, montoMinimo: 5000, montoMaximo: 100000 } });
  const pedir = async (body, file) => {
    const res = respuesta();
    await ctrl.crearSolicitudPublica({ params: { slug: "demo" }, body, file }, res);
    return res;
  };
  const base = { tipo: "monto", monto: "20.000", compradorNombre: "María", compradorEmail: "maria@correo.cl", destinatarioNombre: "Juan" };

  let r = await pedir({ ...base, monto: "1000" });
  assert.equal(r.statusCode, 400);
  assert.match(r.body.message, /entre/);

  r = await pedir({ ...base, compradorEmail: "no-es-correo" });
  assert.equal(r.statusCode, 400);

  r = await pedir({ ...base, destinatarioNombre: "" });
  assert.match(r.body.message, /para quién/);

  r = await pedir(base, undefined);
  assert.equal(r.statusCode, 400);
  assert.match(r.body.message, /comprobante/);

  r = await pedir(base, { buffer: Buffer.from("x"), size: 10, mimetype: "text/html" });
  assert.match(r.body.message, /imagen o un PDF/);
});

test("solicitud pública: negocio sin giftcards activas → 403", async () => {
  Empresa.findOne = async () => ({ _id: EMPRESA, slug: "demo", estado: "activo", giftcards: { activa: false } });
  const res = respuesta();
  await ctrl.crearSolicitudPublica({ params: { slug: "demo" }, body: {} }, res);
  assert.equal(res.statusCode, 403);
});

test("config pública: solo servicios con precio y datos de transferencia", async () => {
  Empresa.findOne = async () => ({
    _id: EMPRESA, slug: "demo", estado: "activo",
    giftcards: { activa: true, permitirMonto: false },
    pagos: { transferencia: { banco: "Banco Estado", numeroCuenta: "123", titular: "Local" } },
  });
  Servicio.find = () => ({
    sort: async () => [
      { _id: SERV_CORTE, nombre: "Corte", precio: 12000, calcularPrecioFinal: () => 12000 },
      { _id: SERV_BARBA, nombre: "Gratis", precio: 0, calcularPrecioFinal: () => 0 },
    ],
  });
  const res = respuesta();
  await ctrl.configPublica({ params: { slug: "demo" } }, res);
  assert.equal(res.body.activa, true);
  assert.equal(res.body.permitirMonto, false);
  assert.deepEqual(res.body.servicios.map((s) => s.nombre), ["Corte"]);
  assert.equal(res.body.transferencia.banco, "Banco Estado");
});

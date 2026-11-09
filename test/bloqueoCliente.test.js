// node --test test/bloqueoCliente.test.js
// Pruebas del bloqueo manual de clientes, sin base de datos (se simulan los modelos).
import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

process.env.TOKEN_SECRET = process.env.TOKEN_SECRET || "secreto-de-prueba";

const { coincideConBloqueado, buscarClienteBloqueado, personalDesdeToken, esRolPersonal } = await import(
  "../src/utils/bloqueoCliente.js"
);
const { TOKEN_SECRET } = await import("../src/config.js");
const { default: Usuario } = await import("../src/models/usuario.model.js");
const { default: Empresa } = await import("../src/models/empresa.model.js");
const { reservarComoInvitado } = await import("../src/controllers/reservaInvitadoController.js");

const EMPRESA = "6a888efabd25931ae0891ec8";
const bloqueada = { _id: "64b000000000000000000001", rut: "12.345.678-5", email: "Pia@Correo.cl", telefono: "+56 9 1234 5678" };

// Usuario.find(...).select(...).lean() → lista de bloqueados simulada
const simularBloqueados = (lista) => {
  Usuario.find = () => ({ select: () => ({ lean: async () => lista }) });
};

test("coincide por RUT aunque venga con otro formato", () => {
  assert.equal(coincideConBloqueado(bloqueada, [{ rut: "123456785" }]), true);
});

test("coincide por correo sin importar mayúsculas", () => {
  assert.equal(coincideConBloqueado(bloqueada, [{ email: " pia@correo.CL " }]), true);
});

test("coincide por teléfono: 8 dígitos, con 9 o con +56", () => {
  for (const telefono of ["12345678", "912345678", "+56912345678"]) {
    assert.equal(coincideConBloqueado(bloqueada, [{ telefono }]), true, telefono);
  }
});

test("coincide por la cuenta (id)", () => {
  assert.equal(coincideConBloqueado(bloqueada, [{ _id: "64b000000000000000000001" }]), true);
});

test("no coincide con otra persona ni con datos vacíos", () => {
  assert.equal(coincideConBloqueado(bloqueada, [{ rut: "11.111.111-1", email: "otra@correo.cl", telefono: "87654321" }]), false);
  assert.equal(coincideConBloqueado(bloqueada, [{ rut: "", email: "", telefono: "" }, null]), false);
  // datos cortos no deben coincidir por accidente
  assert.equal(coincideConBloqueado({ telefono: "123" }, [{ telefono: "123" }]), false);
});

test("buscarClienteBloqueado devuelve el bloqueado que coincide", async () => {
  simularBloqueados([bloqueada]);
  const r = await buscarClienteBloqueado(EMPRESA, { email: "otra@correo.cl" }, { telefono: "912345678" });
  assert.equal(r?._id, bloqueada._id);
  simularBloqueados([]);
  assert.equal(await buscarClienteBloqueado(EMPRESA, { telefono: "912345678" }), null);
});

test("personalDesdeToken: solo admin o profesional de ESTE negocio", () => {
  const firmar = (p) => jwt.sign(p, TOKEN_SECRET);
  const req = (token) => ({ cookies: { token }, headers: {} });
  assert.equal(personalDesdeToken(req(firmar({ rol: "barbero", empresaId: EMPRESA })), EMPRESA), true);
  assert.equal(personalDesdeToken(req(firmar({ rol: "cliente", esAdmin: true, empresaId: EMPRESA })), EMPRESA), true);
  assert.equal(personalDesdeToken(req(firmar({ rol: "cliente", empresaId: EMPRESA })), EMPRESA), false);
  assert.equal(personalDesdeToken(req(firmar({ rol: "barbero", empresaId: "otraempresa" })), EMPRESA), false);
  assert.equal(personalDesdeToken(req(jwt.sign({ rol: "barbero", empresaId: EMPRESA }, "otro-secreto")), EMPRESA), false);
  assert.equal(personalDesdeToken({ headers: {} }, EMPRESA), false);
  assert.equal(esRolPersonal({ rol: "invitado" }), false);
});

// Respuesta de express simulada
const respuesta = () => {
  const r = { statusCode: 200, body: null };
  r.status = (c) => ((r.statusCode = c), r);
  r.json = (b) => ((r.body = b), r);
  return r;
};

test("reserva web de un bloqueado (con otro RUT y correo, mismo teléfono) → 403 neutro", async () => {
  Empresa.findOne = async () => ({ _id: EMPRESA, slug: "demo", estado: "activo" });
  simularBloqueados([bloqueada]);
  const res = respuesta();
  await reservarComoInvitado(
    { params: { slug: "demo" }, headers: {}, body: { nombre: "P", apellido: "X", rut: "11.111.111-1", email: "nueva@correo.cl", telefono: "12345678" } },
    res,
  );
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "CLIENTE_BLOQUEADO");
  assert.doesNotMatch(res.body.message, /bloquead/i);
});

test("el admin agendando desde el panel sí pasa el bloqueo", async () => {
  Empresa.findOne = async () => ({ _id: EMPRESA, slug: "demo", estado: "activo" });
  simularBloqueados([bloqueada]);
  // Si pasa el bloqueo, lo siguiente es buscar al usuario por RUT: lo cortamos ahí
  Usuario.findOne = async () => {
    throw new Error("PASO_EL_BLOQUEO");
  };
  const token = jwt.sign({ rol: "barbero", esAdmin: true, empresaId: EMPRESA }, TOKEN_SECRET);
  await assert.rejects(
    reservarComoInvitado(
      { params: { slug: "demo" }, cookies: { token }, headers: {}, body: { nombre: "P", apellido: "X", rut: "12.345.678-5", email: "pia@correo.cl", telefono: "12345678" } },
      respuesta(),
    ),
    /PASO_EL_BLOQUEO/,
  );
});

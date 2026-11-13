// node --test test/directorio.test.js
import { test } from "node:test";
import assert from "node:assert/strict";

const d = await import("../src/utils/directorio.js");

const n = (slug, rubro, ciudad, extra = {}) => ({
  slug, rubro, ciudad, nombre: slug, ciudadSlug: d.slugCiudad(ciudad), rubroSlug: d.rubroDe({ rubro }).slug,
  rubroPlural: d.rubroDe({ rubro }).plural, ...extra,
});

test("slug de ciudad sin tildes ni mayúsculas", () => {
  assert.equal(d.slugCiudad(" Ovalle "), "ovalle");
  assert.equal(d.slugCiudad("La Serena"), "la-serena");
  assert.equal(d.slugCiudad("Viña del Mar"), "vina-del-mar");
  assert.equal(d.slugCiudad(""), "");
});

test("rubro desde 'rubro' o el campo antiguo 'tipo'", () => {
  assert.equal(d.rubroDe({ rubro: "barberia" }).slug, "barberias");
  assert.equal(d.rubroDe({ tipo: "salon de belleza" }).slug, "salones-de-belleza");
  assert.equal(d.rubroDe({ rubro: "algo-raro" }).slug, "otros");
});

test("ciudades agrupan rubros y usan el nombre más escrito", () => {
  const lista = [n("a", "barberia", "Ovalle"), n("b", "barberia", "ovalle"), n("c", "gimnasio", "Ovalle"), n("d", "barberia", "")];
  const c = d.ciudadesDirectorio(lista);
  assert.equal(c.length, 1);
  assert.equal(c[0].nombre, "Ovalle");
  assert.equal(c[0].total, 3);
  assert.deepEqual(c[0].rubros.map((r) => [r.slug, r.total]), [["barberias", 2], ["gimnasios", 1]]);
});

test("sitemap: portada, directorio, ciudades, negocios y giftcards activas", () => {
  const xml = d.generarSitemap([n("la-santa", "barberia", "Ovalle", { giftcards: { activa: true } }), n("focus", "gimnasio", "Ovalle")]);
  for (const url of [
    "https://www.agendafonfach.cl/",
    "https://www.agendafonfach.cl/negocios",
    "https://www.agendafonfach.cl/negocios/ovalle",
    "https://www.agendafonfach.cl/negocios/ovalle/barberias",
    "https://www.agendafonfach.cl/negocios/ovalle/gimnasios",
    "https://www.agendafonfach.cl/la-santa",
    "https://www.agendafonfach.cl/la-santa/regalar",
    "https://www.agendafonfach.cl/focus",
  ]) {
    assert.ok(xml.includes(`<loc>${url}</loc>`), url);
  }
  assert.ok(!xml.includes("focus/regalar"));
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
});

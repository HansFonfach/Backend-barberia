// node --test test/telefono.test.js
import { test } from "node:test";
import assert from "node:assert/strict";

const { normalizarTelefonoCL: n } = await import("../src/utils/telefono.js");

test("8 dígitos (lo que se escribe después de +569)", () => {
  assert.equal(n("75297584"), "56975297584");
});

test("9 dígitos con el 9 inicial", () => {
  assert.equal(n("975297584"), "56975297584");
});

test("ya completo, con o sin + y espacios", () => {
  assert.equal(n("56975297584"), "56975297584");
  assert.equal(n("+56 9 7529 7584"), "56975297584");
});

test("arregla el 9 repetido (5699...)", () => {
  assert.equal(n("569975297584"), "56975297584");
});

test("vacío y sin valor", () => {
  assert.equal(n(""), "");
  assert.equal(n(undefined), undefined);
  assert.equal(n(null), null);
});

test("otros formatos se dejan solo con dígitos", () => {
  assert.equal(n("+54 11 1234 5678"), "541112345678");
});

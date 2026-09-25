/**
 * compartido.test.ts
 * Pruebas de las validaciones comunes al juego y al servidor.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
    esAvatarValido,
    esModoValido,
    esPuntuacionValida,
    limpiarNombre,
    LONGITUD_MAXIMA_NOMBRE,
    normalizarCodigo,
} from "../api/_lib/compartido";

test("limpia los nombres de jugador", () => {
    assert.equal(limpiarNombre("  Ana   María  "), "Ana María");
    assert.equal(limpiarNombre("<script>x"), "scriptx");
    assert.equal(limpiarNombre("   "), null);
    assert.equal(limpiarNombre(42), null);
    assert.equal(limpiarNombre("a".repeat(50))?.length, LONGITUD_MAXIMA_NOMBRE);
});

test("normaliza los códigos de amigo", () => {
    assert.equal(normalizarCodigo("abc-234"), "ABC234");
    assert.equal(normalizarCodigo(" q7x 9km "), "Q7X9KM");
    assert.equal(normalizarCodigo("ABC12"), null);
    // 0, O, 1, I y L no existen en los códigos (se confunden).
    assert.equal(normalizarCodigo("ABC0O1"), null);
    assert.equal(normalizarCodigo(null), null);
});

test("valida modos, avatares y puntuaciones", () => {
    assert.ok(esModoValido("supervivencia"));
    assert.ok(!esModoValido("trampa"));
    assert.ok(esAvatarValido("🦊"));
    assert.ok(!esAvatarValido("💩"));
    assert.ok(esPuntuacionValida(0));
    assert.ok(esPuntuacionValida(12_345));
    assert.ok(!esPuntuacionValida(-1));
    assert.ok(!esPuntuacionValida(1.5));
    assert.ok(!esPuntuacionValida(10_000_000));
    assert.ok(!esPuntuacionValida("100"));
});

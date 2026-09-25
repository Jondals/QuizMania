/**
 * reglas.test.ts
 * Pruebas de las reglas de cuentas y de que la base de datos acepta
 * exactamente los mismos modos que el juego.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { MODOS } from "../src/config/modos";
import { correoInterno, esUsuarioValido, normalizarUsuario } from "../src/config/reglas";

test("valida los nombres de usuario", () => {
    assert.ok(esUsuarioValido("ana_92"));
    assert.ok(esUsuarioValido(normalizarUsuario("  JonDals ")));
    assert.ok(!esUsuarioValido("ab"));
    assert.ok(!esUsuarioValido("con espacio"));
    assert.ok(!esUsuarioValido("ñandú"));
    assert.ok(!esUsuarioValido("a".repeat(21)));
});

test("el correo interno se forma con el usuario", () => {
    assert.equal(correoInterno("ana_92"), "ana_92@quizmania.app");
});

test("registrar_partida acepta los mismos modos que el juego", () => {
    const sql = readFileSync("supabase/schema.sql", "utf8");
    const lista = sql.match(/p_modo not in \(([^)]*)\)/)?.[1] ?? "";
    const modosSql = [...lista.matchAll(/'([a-z-]+)'/g)].map((coincidencia) => coincidencia[1]).sort();
    assert.deepEqual(modosSql, MODOS.map((modo) => modo.id).sort());
});

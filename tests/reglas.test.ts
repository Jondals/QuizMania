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

test("generar_codigo_amigo recibe usuario y nombre y los excluye del código", () => {
    const sql = readFileSync("supabase/schema.sql", "utf8");
    const cuerpo = sql.slice(sql.indexOf("create function public.generar_codigo_amigo"));
    // El código se genera teniendo en cuenta el usuario y el nombre del jugador...
    assert.match(sql, /create function public\.generar_codigo_amigo\(p_usuario text default null, p_nombre text default null\)/);
    // ...y se descarta si coincide con alguno de los dos.
    assert.match(cuerpo, /position\(v_codigo in v_propio\) = 0/);
    // El disparador se lo pasa al crear el perfil.
    assert.match(sql, /generar_codigo_amigo\(new\.usuario, new\.nombre\)/);
});

test("asegurar_codigo_amigo repara los códigos que son el usuario o el nombre", () => {
    const sql = readFileSync("supabase/schema.sql", "utf8");
    const cuerpo = sql.slice(sql.indexOf("create function public.asegurar_codigo_amigo"));
    // Solo lo usa quien tiene sesión...
    assert.match(cuerpo, /if auth\.uid\(\) is null then\s+raise exception 'no-autenticado';/);
    // ...y compara el código con su usuario y su nombre antes de regenerarlo.
    assert.match(cuerpo, /v_codigo = upper\(regexp_replace\(coalesce\(v_usuario/);
    assert.match(cuerpo, /v_codigo = upper\(regexp_replace\(coalesce\(v_nombre/);
    assert.match(cuerpo, /update public\.perfiles set codigo = v_codigo/);
    // Solo los jugadores con sesión pueden llamarla.
    assert.match(sql, /grant execute on function public\.asegurar_codigo_amigo\(\) to authenticated;/);
    assert.doesNotMatch(sql, /grant execute on function public\.asegurar_codigo_amigo\(\) to anon/);
});

test("el arreglo de códigos antiguos también repara los que eran el usuario", () => {
    const sql = readFileSync("supabase/schema.sql", "utf8");
    const arreglo = sql.slice(sql.indexOf("-- Jugadores que ya existían sin código"));
    assert.match(arreglo, /set codigo = public\.generar_codigo_amigo\(usuario, nombre\)/);
    assert.match(arreglo, /where codigo is null/);
    assert.match(arreglo, /= upper\(regexp_replace\(coalesce\(nombre/);
});

test("ranking devuelve partidas, aciertos y preguntas de cada jugador", () => {
    const sql = readFileSync("supabase/schema.sql", "utf8");
    const cuerpo = sql.slice(sql.indexOf("create function public.ranking("));
    const retorno = cuerpo.slice(0, cuerpo.indexOf("language sql"));
    for (const columna of ["partidas", "aciertos", "preguntas"]) {
        assert.match(retorno, new RegExp("\\n\\s+" + columna + "\\s+integer,"), `falta ${columna} en el retorno`);
    }
    // Y el select final los devuelve, no solo los declara.
    assert.match(cuerpo, /o\.partidas, o\.aciertos, o\.preguntas,/);
    // La base los saca del perfil, así que salen aunque el modo no tenga récord.
    assert.match(cuerpo, /p\.partidas, p\.aciertos, p\.preguntas,/);
});


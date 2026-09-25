/**
 * preguntas.test.ts
 * Comprueba que los archivos de preguntas locales están bien formados y que
 * cada tema tiene su archivo.
 */

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { TEMAS, TODOS_LOS_ARCHIVOS_LOCALES } from "../src/config/temas";

/** Mínimo de preguntas locales por tema (para jugar sin conexión). */
const MINIMO_POR_TEMA = 20;

test("cada tema con archivo local lo tiene en public/", () => {
    for (const archivo of TODOS_LOS_ARCHIVOS_LOCALES) {
        assert.ok(existsSync(`public/${archivo}`), `Falta public/${archivo}`);
    }
    assert.equal(new Set(TEMAS.map((tema) => tema.id)).size, TEMAS.length, "Hay ids de tema repetidos");
});

test("las preguntas locales están bien formadas y no se repiten", () => {
    const vistas = new Set<string>();
    for (const nombre of readdirSync("public/preguntas")) {
        const preguntas: unknown = JSON.parse(readFileSync(`public/preguntas/${nombre}`, "utf8"));
        assert.ok(Array.isArray(preguntas), `${nombre} no es una lista`);
        assert.ok(preguntas.length >= MINIMO_POR_TEMA, `${nombre} tiene menos de ${MINIMO_POR_TEMA} preguntas`);
        for (const pregunta of preguntas as unknown[]) {
            assert.ok(Array.isArray(pregunta) && pregunta.length === 5, `${nombre}: ${JSON.stringify(pregunta)}`);
            const textos = pregunta as string[];
            assert.ok(textos.every((texto) => typeof texto === "string" && texto.trim().length > 0), `${nombre}: texto vacío`);
            assert.equal(new Set(textos.slice(1)).size, 4, `${nombre}: respuestas repetidas en "${textos[0]}"`);
            const clave = textos[0].toLowerCase();
            assert.ok(!vistas.has(clave), `Pregunta repetida: "${textos[0]}"`);
            vistas.add(clave);
        }
    }
});

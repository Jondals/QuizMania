/**
 * puntuacion.test.ts
 * Pruebas de los puntos por acierto y de su formato.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { calcularPuntosAcierto, formatearPuntos } from "../src/juego/puntuacion";

test("un acierto sin racha ni tiempo vale 100", () => {
    assert.equal(calcularPuntosAcierto({ racha: 1 }), 100);
});

test("la racha suma 20 por acierto seguido, con un máximo de +100", () => {
    assert.equal(calcularPuntosAcierto({ racha: 2 }), 120);
    assert.equal(calcularPuntosAcierto({ racha: 4 }), 160);
    assert.equal(calcularPuntosAcierto({ racha: 6 }), 200);
    assert.equal(calcularPuntosAcierto({ racha: 30 }), 200);
});

test("la rapidez suma hasta 50 según el tiempo que sobra", () => {
    assert.equal(calcularPuntosAcierto({ racha: 1, segundosRestantes: 10, segundosPorPregunta: 10 }), 150);
    assert.equal(calcularPuntosAcierto({ racha: 1, segundosRestantes: 5, segundosPorPregunta: 10 }), 125);
    assert.equal(calcularPuntosAcierto({ racha: 1, segundosRestantes: -2, segundosPorPregunta: 10 }), 100);
    // Sin tiempo por pregunta no hay bonus aunque lleguen segundos.
    assert.equal(calcularPuntosAcierto({ racha: 1, segundosRestantes: 8, segundosPorPregunta: null }), 100);
});

test("formatea los miles según el idioma", () => {
    assert.equal(formatearPuntos(0, "es"), "0");
    assert.equal(formatearPuntos(1234, "es"), "1.234");
    assert.equal(formatearPuntos(1234567, "en"), "1,234,567");
});

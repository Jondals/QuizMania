/**
 * enlaces.test.ts
 * Pruebas del reconocimiento de links de YouTube y Spotify.
 * Se ejecutan con `npm test`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { analizarEnlaceMusical } from "../src/audio/enlaces";

test("reconoce vídeos de YouTube en sus distintos formatos", () => {
    const esperado = { plataforma: "youtube", idVideo: "dQw4w9WgXcQ", idLista: undefined };
    for (const enlace of [
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s",
        "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://music.youtube.com/watch?v=dQw4w9WgXcQ&feature=share",
        "https://youtu.be/dQw4w9WgXcQ?si=abc123",
        "https://www.youtube.com/shorts/dQw4w9WgXcQ",
        "https://www.youtube.com/embed/dQw4w9WgXcQ",
        "https://www.youtube.com/live/dQw4w9WgXcQ",
        "  www.youtube.com/watch?v=dQw4w9WgXcQ  ",
    ]) {
        assert.deepEqual(analizarEnlaceMusical(enlace), esperado, enlace);
    }
});

test("reconoce listas de YouTube", () => {
    assert.deepEqual(analizarEnlaceMusical("https://www.youtube.com/playlist?list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI"), {
        plataforma: "youtube",
        idVideo: undefined,
        idLista: "PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI",
    });
    assert.deepEqual(analizarEnlaceMusical("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI&index=2"), {
        plataforma: "youtube",
        idVideo: "dQw4w9WgXcQ",
        idLista: "PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI",
    });
});

test("reconoce enlaces y URIs de Spotify", () => {
    assert.deepEqual(analizarEnlaceMusical("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=1234"), {
        plataforma: "spotify",
        tipo: "playlist",
        id: "37i9dQZF1DXcBWIGoYBM5M",
    });
    assert.deepEqual(analizarEnlaceMusical("https://open.spotify.com/intl-es/track/4uLU6hMCjMI75M1A2tKUQC"), {
        plataforma: "spotify",
        tipo: "track",
        id: "4uLU6hMCjMI75M1A2tKUQC",
    });
    assert.deepEqual(analizarEnlaceMusical("spotify:album:1DFixLWuPkv3KT3TnV35m3"), {
        plataforma: "spotify",
        tipo: "album",
        id: "1DFixLWuPkv3KT3TnV35m3",
    });
});

test("rechaza enlaces que no son música de YouTube o Spotify", () => {
    for (const enlace of [
        "",
        "hola",
        "https://www.google.com/watch?v=dQw4w9WgXcQ",
        "https://www.youtube.com/watch?v=corto",
        "https://www.youtube.com/@canal",
        "https://open.spotify.com/user/abc",
        "https://open.spotify.com/track/idmalo",
        "javascript:alert(1)",
    ]) {
        assert.equal(analizarEnlaceMusical(enlace), null, enlace);
    }
});

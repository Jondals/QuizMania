/**
 * pantallas.ts
 * El juego es una sola página con varias "pantallas" (secciones del HTML).
 * Aquí se decide cuál se ve en cada momento.
 */

import { obtenerElemento } from "../utilidades/dom";

/** Pantallas del juego. */
export type NombrePantalla = "inicio" | "carga" | "pregunta" | "resultados" | "ranking";

const IDS_PANTALLAS: Record<NombrePantalla, string> = {
    inicio: "pantalla-inicio",
    carga: "pantalla-carga",
    pregunta: "pantalla-pregunta",
    resultados: "pantalla-resultados",
    ranking: "pantalla-ranking",
};

/** Devuelve la pantalla que se está viendo. */
export function pantallaActual(): NombrePantalla {
    const visible = (Object.keys(IDS_PANTALLAS) as NombrePantalla[]).find(
        (nombre) => !obtenerElemento(IDS_PANTALLAS[nombre]).hidden,
    );
    return visible ?? "inicio";
}

/**
 * Muestra una pantalla y oculta todas las demás. Mueve el foco al título de
 * la nueva pantalla para que los lectores de pantalla anuncien el cambio.
 * @param nombre Pantalla a mostrar.
 */
export function mostrarPantalla(nombre: NombrePantalla): void {
    for (const [nombrePantalla, id] of Object.entries(IDS_PANTALLAS)) {
        obtenerElemento(id).hidden = nombrePantalla !== nombre;
    }
    const titulo = obtenerElemento(IDS_PANTALLAS[nombre]).querySelector<HTMLElement>("h1, h2");
    titulo?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
}

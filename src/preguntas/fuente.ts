/**
 * fuente.ts
 * Suministro continuo de preguntas para una partida. Sirve tanto para las
 * partidas de 10 preguntas como para los modos infinitos:
 *   1. Pide lotes online (Open Trivia DB o The Trivia API, en inglés) y va
 *      pidiendo el siguiente antes de que se acaben, para no hacer esperar.
 *   2. Si la API falla, sigue con el JSON local del tema (en español) y, si
 *      se agota, con la mezcla de todos los temas locales.
 *   3. Traduce cada lote al idioma del jugador si hace falta.
 * Nunca repite una pregunta dentro de la misma partida mientras queden nuevas.
 */

import type { Tema } from "../config/temas";
import { TODOS_LOS_ARCHIVOS_LOCALES } from "../config/temas";
import type { Idioma } from "../i18n/textos";
import { barajar } from "../utilidades/aleatorio";
import type { Pregunta } from "./modelo";
import { PREGUNTAS_POR_LOTE } from "./modelo";
import { descargarPreguntasOpenTdb } from "./proveedor-opentdb";
import { cargarPreguntasLocales } from "./proveedor-local";
import { descargarPreguntasTriviaApi } from "./proveedor-trivia-api";
import { traducirTextos } from "./traductor";

/** Cuando quedan estas preguntas o menos en la cola, se pide el siguiente lote. */
const UMBRAL_PRECARGA = 4;
/** Intentos de conseguir un lote con preguntas no vistas. */
const INTENTOS_POR_LOTE = 3;

/**
 * Traduce el enunciado y las respuestas de todas las preguntas.
 * @param preguntas Preguntas originales.
 * @param origen Idioma de las preguntas.
 * @param destino Idioma del jugador.
 */
export async function traducirPreguntas(preguntas: Pregunta[], origen: Idioma, destino: Idioma): Promise<Pregunta[]> {
    if (origen === destino || preguntas.length === 0) {
        return preguntas;
    }
    // Se aplanan todos los textos en una lista para traducirlos de una vez.
    const textosOriginales = preguntas.flatMap((pregunta) => [
        pregunta.enunciado,
        ...pregunta.respuestas.map((respuesta) => respuesta.texto),
    ]);
    const textosTraducidos = await traducirTextos(textosOriginales, origen, destino);

    let posicion = 0;
    return preguntas.map((pregunta) => ({
        enunciado: textosTraducidos[posicion++],
        respuestas: pregunta.respuestas.map((respuesta) => ({ ...respuesta, texto: textosTraducidos[posicion++] })),
    }));
}

/**
 * Descarga un lote de preguntas online del tema, según la API que tenga asignada.
 * @param tema Tema de la partida.
 * @returns Preguntas en inglés.
 */
function descargarLoteOnline(tema: Tema): Promise<Pregunta[]> {
    const fuente = tema.fuenteOnline;
    return fuente.api === "opentdb"
        ? descargarPreguntasOpenTdb(PREGUNTAS_POR_LOTE, fuente.categoria)
        : descargarPreguntasTriviaApi(PREGUNTAS_POR_LOTE, fuente.categoria);
}

/** Preguntas de una partida, en orden y sin repetir. */
export class FuentePreguntas {
    private readonly cola: Pregunta[] = [];
    /** Enunciados originales ya usados (antes de traducir). */
    private readonly vistas = new Set<string>();
    private cargaEnCurso: Promise<void> | null = null;
    /** true en cuanto la API online falla: el resto de la partida es local. */
    private soloLocal = false;
    /** Preguntas locales pendientes de usar. */
    private reservaLocal: Pregunta[] = [];
    /** Ya se agotó el archivo del tema y se usa la mezcla de todos. */
    private usandoMezcla = false;
    /** true si alguna pregunta ha salido del respaldo local. */
    origenLocal = false;

    /**
     * @param tema Tema de la partida.
     * @param idioma Idioma del jugador.
     * @param alTraducir Se llama antes de traducir un lote (para avisar en pantalla).
     */
    constructor(
        private readonly tema: Tema,
        private readonly idioma: Idioma,
        private readonly alTraducir: () => void = () => {},
    ) {}

    /**
     * Devuelve la siguiente pregunta (esperando a que llegue si hace falta)
     * y precarga más en segundo plano.
     * @throws Si no hay forma de conseguir preguntas.
     */
    async siguiente(): Promise<Pregunta> {
        if (this.cola.length === 0) {
            await this.rellenar();
        }
        const pregunta = this.cola.shift();
        if (!pregunta) {
            throw new Error("No quedan preguntas");
        }
        if (this.cola.length <= UMBRAL_PRECARGA) {
            this.rellenar().catch(() => {});
        }
        return pregunta;
    }

    /** Pide un lote nuevo (si ya hay uno en camino, espera a ese). */
    private rellenar(): Promise<void> {
        this.cargaEnCurso ??= this.cargarLote().finally(() => {
            this.cargaEnCurso = null;
        });
        return this.cargaEnCurso;
    }

    /** Consigue un lote de preguntas nuevas, lo traduce y lo añade a la cola. */
    private async cargarLote(): Promise<void> {
        for (let intento = 0; intento < INTENTOS_POR_LOTE; intento++) {
            let lote: Pregunta[] | null = null;
            let idiomaLote: Idioma = "es";

            if (!this.soloLocal) {
                try {
                    lote = await descargarLoteOnline(this.tema);
                    idiomaLote = "en";
                } catch {
                    this.soloLocal = true;
                }
            }
            if (!lote) {
                lote = await this.tomarLoteLocal();
                this.origenLocal = true;
            }

            const nuevas = lote.filter((pregunta) => !this.vistas.has(pregunta.enunciado));
            nuevas.forEach((pregunta) => this.vistas.add(pregunta.enunciado));
            if (nuevas.length === 0) {
                continue;
            }
            if (idiomaLote !== this.idioma) {
                this.alTraducir();
            }
            this.cola.push(...(await traducirPreguntas(nuevas, idiomaLote, this.idioma)));
            return;
        }
        throw new Error("No se consiguieron preguntas nuevas");
    }

    /**
     * Saca un lote de la reserva local. Primero el archivo del tema; cuando
     * se agota, todos los temas mezclados; cuando se agota también, se
     * permite repetir.
     */
    private async tomarLoteLocal(): Promise<Pregunta[]> {
        if (this.reservaLocal.length === 0) {
            const usarMezcla = this.usandoMezcla || this.tema.archivoLocal === null;
            const archivos = usarMezcla ? TODOS_LOS_ARCHIVOS_LOCALES : [this.tema.archivoLocal as string];
            let disponibles = (await cargarPreguntasLocales(archivos)).filter((p) => !this.vistas.has(p.enunciado));
            if (disponibles.length === 0) {
                if (!usarMezcla) {
                    this.usandoMezcla = true;
                    return this.tomarLoteLocal();
                }
                // Se han visto todas: se empieza otra vuelta.
                this.vistas.clear();
                disponibles = await cargarPreguntasLocales(archivos);
            }
            this.reservaLocal = barajar(disponibles);
            if (!usarMezcla) {
                // La próxima vez que se agote el tema, se pasa a la mezcla.
                this.usandoMezcla = true;
            }
        }
        return this.reservaLocal.splice(0, PREGUNTAS_POR_LOTE);
    }
}

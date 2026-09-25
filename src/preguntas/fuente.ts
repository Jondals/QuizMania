/**
 * fuente.ts
 * Suministro continuo de preguntas para una partida. Sirve tanto para las
 * partidas de 10 preguntas como para los modos infinitos:
 *   1. Pide lotes online (Open Trivia DB o The Trivia API, en inglés) y va
 *      pidiendo el siguiente antes de que se acaben, para no hacer esperar.
 *   2. Si la API falla o tarda demasiado, sigue con el JSON local del tema
 *      (en español) y, si se agota, con la mezcla de todos los temas.
 *   3. Traduce cada lote al idioma del jugador (y lo vuelve a traducir si
 *      el jugador cambia de idioma a mitad de partida).
 * Nunca repite una pregunta dentro de la misma partida mientras queden nuevas.
 *
 * Tiempos límite: Open Trivia DB solo admite una petición cada 5 s y, si se
 * juega seguido, puede tardar mucho. Por eso la API online y la traducción
 * tienen un tiempo máximo; si se pasa, se usan las preguntas locales o el
 * texto sin traducir, y el juego nunca se queda colgado cargando.
 */

import type { FuenteOnline, Tema } from "../config/temas";
import { TODOS_LOS_ARCHIVOS_LOCALES } from "../config/temas";
import type { Idioma } from "../i18n/textos";
import { barajar } from "../utilidades/aleatorio";
import { conLimiteDeTiempo } from "../utilidades/red";
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
/** Tiempo máximo esperando a la API online en el primer lote (ms). */
const LIMITE_ONLINE_PRIMER_LOTE = 6000;
/** Tiempo máximo esperando a la API online en los lotes siguientes (se piden de antemano) (ms). */
const LIMITE_ONLINE = 15000;
/** Tiempo máximo de una traducción (ms). */
const LIMITE_TRADUCCION = 7000;

/**
 * Devuelve la versión sin traducir de una pregunta y su idioma.
 * @param pregunta Pregunta (traducida o no).
 */
function versionOriginal(pregunta: Pregunta): Pregunta & { idioma: Idioma } {
    const original = pregunta.original ?? pregunta;
    return { ...original, idioma: original.idioma ?? "es" };
}

/**
 * Pone varias preguntas en el idioma pedido. Siempre se traduce desde el
 * texto original; si el original ya está en ese idioma, se usa tal cual.
 * Si la traducción falla o tarda demasiado, las preguntas se quedan como estaban.
 * @param preguntas Preguntas a adaptar.
 * @param destino Idioma del jugador.
 */
export async function adaptarPreguntasAlIdioma(preguntas: readonly Pregunta[], destino: Idioma): Promise<Pregunta[]> {
    const resultado = [...preguntas];
    const pendientes: { posicion: number; original: Pregunta & { idioma: Idioma } }[] = [];

    preguntas.forEach((pregunta, posicion) => {
        if (pregunta.idioma === destino) return;
        const original = versionOriginal(pregunta);
        if (original.idioma === destino) {
            resultado[posicion] = { ...original, original: undefined };
        } else {
            pendientes.push({ posicion, original });
        }
    });

    // Se agrupan por idioma de origen para traducir cada grupo de una vez.
    for (const origen of ["es", "en"] as const) {
        const grupo = pendientes.filter((pendiente) => pendiente.original.idioma === origen);
        if (grupo.length === 0) continue;
        const textos = grupo.flatMap(({ original }) => [original.enunciado, ...original.respuestas.map((r) => r.texto)]);
        let traducidos: string[];
        try {
            traducidos = await conLimiteDeTiempo(traducirTextos(textos, origen, destino), LIMITE_TRADUCCION);
        } catch {
            continue; // Sin traducción: se quedan en su idioma.
        }
        let indice = 0;
        for (const { posicion, original } of grupo) {
            resultado[posicion] = {
                enunciado: traducidos[indice++],
                respuestas: original.respuestas.map((respuesta) => ({ ...respuesta, texto: traducidos[indice++] })),
                idioma: destino,
                original,
            };
        }
    }
    return resultado;
}

/**
 * Descarga un lote de preguntas online del tema, según la API que tenga asignada.
 * @param fuente API y categoría del tema.
 * @param dificultad Dificultad pedida (null = cualquiera).
 * @returns Preguntas en inglés.
 */
async function descargarLoteOnline(fuente: FuenteOnline, dificultad: "hard" | null): Promise<Pregunta[]> {
    const lote =
        fuente.api === "opentdb"
            ? await descargarPreguntasOpenTdb(PREGUNTAS_POR_LOTE, fuente.categoria, dificultad)
            : await descargarPreguntasTriviaApi(PREGUNTAS_POR_LOTE, fuente.categoria, dificultad);
    return lote.map((pregunta) => ({ ...pregunta, idioma: "en" }));
}

/** Preguntas de una partida, en orden y sin repetir. */
export class FuentePreguntas {
    private readonly cola: Pregunta[] = [];
    /** Enunciados originales ya usados (antes de traducir). */
    private readonly vistas = new Set<string>();
    private cargaEnCurso: Promise<void> | null = null;
    /** true en cuanto la API online falla o tarda demasiado: el resto de la partida es local. */
    private soloLocal = false;
    /** Preguntas locales pendientes de usar. */
    private reservaLocal: Pregunta[] = [];
    /** Ya se agotó el archivo del tema y se usa la mezcla de todos. */
    private usandoMezcla = false;
    /** true cuando la partida terminó: no se piden más preguntas. */
    private detenida = false;
    /** true hasta que llega el primer lote. */
    private esPrimerLote = true;
    /** true si alguna pregunta ha salido del respaldo local porque falló la API. */
    origenLocal = false;

    /**
     * @param tema Tema de la partida ("Al azar" mezcla todos).
     * @param idioma Idioma del jugador.
     * @param dificultad Dificultad de las preguntas online (null = cualquiera).
     * @param alTraducir Se llama antes de traducir un lote (para avisar en pantalla).
     */
    constructor(
        private readonly tema: Tema,
        private idioma: Idioma,
        private readonly dificultad: "hard" | null = null,
        private readonly alTraducir: () => void = () => {},
    ) {
        // Los temas sin API online solo tienen preguntas locales.
        this.soloLocal = tema.fuenteOnline === null;
    }

    /** Deja de pedir preguntas (al terminar o abandonar la partida). */
    detener(): void {
        this.detenida = true;
    }

    /**
     * Cambia el idioma de las preguntas que quedan por salir.
     * @param idioma Idioma nuevo.
     */
    async cambiarIdioma(idioma: Idioma): Promise<void> {
        this.idioma = idioma;
        const pendientes = this.cola.splice(0);
        this.cola.unshift(...(await adaptarPreguntasAlIdioma(pendientes, idioma)));
    }

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
        return pregunta.idioma === this.idioma ? pregunta : (await adaptarPreguntasAlIdioma([pregunta], this.idioma))[0];
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
        for (let intento = 0; intento < INTENTOS_POR_LOTE && !this.detenida; intento++) {
            let lote: Pregunta[] | null = null;

            if (!this.soloLocal && this.tema.fuenteOnline) {
                try {
                    const limite = this.esPrimerLote ? LIMITE_ONLINE_PRIMER_LOTE : LIMITE_ONLINE;
                    lote = await conLimiteDeTiempo(descargarLoteOnline(this.tema.fuenteOnline, this.dificultad), limite);
                } catch {
                    this.soloLocal = true;
                }
            }
            if (this.detenida) return;
            if (!lote) {
                lote = await this.tomarLoteLocal();
                // Solo se avisa de "sin conexión" si el tema tenía preguntas online.
                this.origenLocal ||= this.tema.fuenteOnline !== null;
            }

            const nuevas = lote.filter((pregunta) => !this.vistas.has(pregunta.enunciado));
            nuevas.forEach((pregunta) => this.vistas.add(pregunta.enunciado));
            if (nuevas.length === 0) {
                continue;
            }
            if (nuevas.some((pregunta) => pregunta.idioma !== this.idioma)) {
                this.alTraducir();
            }
            const adaptadas = await adaptarPreguntasAlIdioma(nuevas, this.idioma);
            if (this.detenida) return;
            this.cola.push(...adaptadas);
            this.esPrimerLote = false;
            return;
        }
        if (!this.detenida) {
            throw new Error("No se consiguieron preguntas nuevas");
        }
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
        return this.reservaLocal.splice(0, PREGUNTAS_POR_LOTE).map((pregunta) => ({ ...pregunta, idioma: "es" }));
    }
}

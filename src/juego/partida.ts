/**
 * partida.ts
 * Todo lo que pasa después de que la tragaperras elige un tema:
 * cargar preguntas, mostrarlas, llevar el tiempo, las vidas y los puntos,
 * enseñar los resultados y permitir revisar las respuestas al final.
 *
 * Una partida termina cuando:
 *   - se responden todas las preguntas (modos de 10 preguntas),
 *   - se acaban las vidas (Supervivencia, Muerte súbita),
 *   - se acaba el tiempo total (Contrarreloj),
 *   - o el jugador pulsa "Terminar".
 */

import { reproducirEfecto } from "../audio/efectos";
import type { Modo } from "../config/modos";
import type { Tema } from "../config/temas";
import { obtenerIdioma, texto } from "../i18n/textos";
import { abrirEntrar, mensajeDeErrorCuenta } from "../cuenta/interfaz-cuenta";
import { hayOnline, obtenerPerfil, registrarPartidaOnline } from "../cuenta/sesion";
import { mostrarComparacionConAmigos } from "../online/social";
import { leerRecord, registrarPartidaLocal } from "../perfil/records";
import type { Idioma } from "../i18n/textos";
import { adaptarPreguntasAlIdioma, FuentePreguntas } from "../preguntas/fuente";
import { esperar } from "../utilidades/aleatorio";
import { obtenerElemento } from "../utilidades/dom";
import type { RegistroPregunta } from "./estado";
import { empezarPartida, estadoPartida, obtenerRegistroActual } from "./estado";
import { mostrarPantalla } from "./pantallas";
import { calcularPuntosAcierto, formatearPuntos } from "./puntuacion";

/** Tiempo que se ve si has acertado o fallado antes de pasar a la siguiente (ms). */
const PAUSA_TRAS_RESPONDER = 1300;
/** En Contrarreloj la pausa es más corta para no perder ritmo (ms). */
const PAUSA_TRAS_RESPONDER_RAPIDA = 650;
/** Cada cuánto se actualiza el reloj (ms). */
const INTERVALO_RELOJ = 100;
/** Segundos finales en los que suena un tic por segundo. */
const SEGUNDOS_DE_AVISO = 3;

/** Letras que se ponen delante de cada respuesta. */
const LETRAS_RESPUESTAS = ["A", "B", "C", "D", "E", "F"];

/** Elementos del HTML que se usan en este módulo. */
const elementos = {
    mensajeCarga: obtenerElemento("mensaje-carga"),
    errorCarga: obtenerElemento("error-carga"),
    indicadorCarga: obtenerElemento("indicador-carga"),
    tarjetaPregunta: obtenerElemento("tarjeta-pregunta"),
    insigniaTema: obtenerElemento("insignia-tema"),
    insigniaModo: obtenerElemento("insignia-modo"),
    contadorPreguntas: obtenerElemento("contador-preguntas"),
    marcador: obtenerElemento("marcador"),
    marcadorPuntos: obtenerElemento("marcador-puntos"),
    puntosGanados: obtenerElemento("puntos-ganados"),
    marcadorRacha: obtenerElemento("marcador-racha"),
    marcadorVidas: obtenerElemento("marcador-vidas"),
    marcadorTiempo: obtenerElemento("marcador-tiempo"),
    barraProgreso: obtenerElemento("barra-progreso"),
    barraProgresoRelleno: obtenerElemento("barra-progreso-relleno"),
    barraTiempo: obtenerElemento("barra-tiempo"),
    barraTiempoRelleno: obtenerElemento("barra-tiempo-relleno"),
    numeroEnunciado: obtenerElemento("numero-enunciado"),
    textoEnunciado: obtenerElemento("texto-enunciado"),
    enunciado: obtenerElemento("enunciado"),
    listaRespuestas: obtenerElemento("lista-respuestas"),
    avisoLocal: obtenerElemento("aviso-local"),
    controlesJuego: obtenerElemento("controles-juego"),
    controlesRevision: obtenerElemento("controles-revision"),
    botonAnterior: obtenerElemento("boton-anterior", HTMLButtonElement),
    botonSiguiente: obtenerElemento("boton-siguiente", HTMLButtonElement),
    modoResultados: obtenerElemento("modo-resultados"),
    temaResultados: obtenerElemento("tema-resultados"),
    mensajeResultado: obtenerElemento("mensaje-resultado"),
    puntosFinales: obtenerElemento("puntos-finales"),
    avisoRecord: obtenerElemento("aviso-record"),
    puntuacion: obtenerElemento("puntuacion"),
    porcentaje: obtenerElemento("porcentaje"),
    mejorRacha: obtenerElemento("mejor-racha"),
    recordModo: obtenerElemento("record-modo"),
    botonRevisar: obtenerElemento("boton-revisar", HTMLButtonElement),
    avisoGuardado: obtenerElemento("aviso-guardado"),
    avisoInvitado: obtenerElemento("aviso-invitado"),
};

/** Cambia en cada partida: las esperas de una partida anterior se descartan. */
let generacion = 0;
let fuente: FuentePreguntas | null = null;
let temporizadorReloj: ReturnType<typeof setInterval> | null = null;
let ultimoTic = 0;
/** true mientras hay una pregunta en pantalla esperando respuesta. */
let esperandoRespuesta = false;
/** true mientras se traduce la pregunta en pantalla (el reloj se para). */
let traduciendo = false;
/** Si la última partida batió el récord (para repintar los resultados). */
let ultimoNuevoRecord = false;
/** Si la última partida se considera ganada (récord o al menos un 60 % de aciertos). */
let ultimaVictoria = false;
/** Porcentaje de aciertos a partir del cual la partida cuenta como ganada. */
const PORCENTAJE_PARA_GANAR = 0.6;

/** Indica si hay una partida en juego (para avisar antes de abandonarla). */
export function hayPartidaEnJuego(): boolean {
    return estadoPartida.enJuego;
}

/**
 * Carga la primera pregunta y empieza la partida.
 * Mientras tanto se ve la pantalla de carga; si todo falla, un error.
 * @param modo Modo elegido.
 * @param tema Tema que ha salido en la tragaperras.
 */
export async function iniciarPartida(modo: Modo, tema: Tema): Promise<void> {
    const miGeneracion = ++generacion;
    detenerReloj();
    elementos.mensajeCarga.textContent = texto("cargandoPreguntas");
    elementos.errorCarga.hidden = true;
    elementos.indicadorCarga.hidden = false;
    mostrarPantalla("carga");

    fuente?.detener();
    fuente = new FuentePreguntas(tema, obtenerIdioma(), modo.dificultad, () => {
        elementos.mensajeCarga.textContent = texto("traduciendo");
    });
    try {
        const primera = await fuente.siguiente();
        if (miGeneracion !== generacion) return;
        empezarPartida(modo, tema);
        mostrarPantalla("pregunta");
        presentarPregunta(primera);
        iniciarReloj();
    } catch {
        if (miGeneracion !== generacion) return;
        elementos.indicadorCarga.hidden = true;
        elementos.mensajeCarga.textContent = "";
        elementos.errorCarga.hidden = false;
    }
}

/** Abandona la partida en juego sin guardar nada. */
export function abandonarPartida(): void {
    generacion++;
    detenerReloj();
    esperandoRespuesta = false;
    estadoPartida.enJuego = false;
    fuente?.detener();
}

/* ---------- Reloj ---------- */

/** Arranca el reloj de la partida (solo corre mientras se espera respuesta). */
function iniciarReloj(): void {
    detenerReloj();
    const { segundosPorPregunta, segundosTotales } = estadoPartida.modo;
    if (segundosPorPregunta === null && segundosTotales === null) {
        return;
    }
    ultimoTic = performance.now();
    temporizadorReloj = setInterval(avanzarReloj, INTERVALO_RELOJ);
}

function detenerReloj(): void {
    if (temporizadorReloj !== null) {
        clearInterval(temporizadorReloj);
        temporizadorReloj = null;
    }
}

/** Segundos que quedan y máximo del reloj visible (por pregunta o total), o null si no hay. */
function relojVisible(): { restantes: number; maximo: number } | null {
    const { modo, segundosPregunta, segundosTotales } = estadoPartida;
    if (modo.segundosTotales !== null) return { restantes: segundosTotales, maximo: modo.segundosTotales };
    if (modo.segundosPorPregunta !== null) return { restantes: segundosPregunta, maximo: modo.segundosPorPregunta };
    return null;
}

/** Descuenta el tiempo pasado, avisa en los últimos segundos y corta si se acaba. */
function avanzarReloj(): void {
    const ahora = performance.now();
    const transcurrido = (ahora - ultimoTic) / 1000;
    ultimoTic = ahora;
    if (!esperandoRespuesta || traduciendo) {
        return;
    }
    const antes = relojVisible()?.restantes ?? 0;
    if (estadoPartida.modo.segundosPorPregunta !== null) estadoPartida.segundosPregunta -= transcurrido;
    if (estadoPartida.modo.segundosTotales !== null) estadoPartida.segundosTotales -= transcurrido;
    const despues = relojVisible()?.restantes ?? 0;

    if (Math.ceil(despues) < Math.ceil(antes) && Math.ceil(despues) <= SEGUNDOS_DE_AVISO && despues > 0) {
        reproducirEfecto("tic");
    }
    pintarReloj();

    if (estadoPartida.modo.segundosTotales !== null && estadoPartida.segundosTotales <= 0) {
        // Se acabó la partida (la pregunta a medias no cuenta).
        esperandoRespuesta = false;
        reproducirEfecto("fallo");
        terminarPartida();
    } else if (estadoPartida.modo.segundosPorPregunta !== null && estadoPartida.segundosPregunta <= 0) {
        void responderPregunta(null);
    }
}

/* ---------- Preguntas ---------- */

/**
 * Añade una pregunta al historial y la muestra.
 * @param pregunta Pregunta nueva.
 */
function presentarPregunta(pregunta: RegistroPregunta["pregunta"]): void {
    estadoPartida.historial.push({ pregunta, elegida: null, respondida: false, acertada: false, puntos: 0 });
    estadoPartida.segundosPregunta = estadoPartida.modo.segundosPorPregunta ?? 0;
    estadoPartida.preguntasLocales ||= fuente?.origenLocal ?? false;
    elementos.tarjetaPregunta.classList.remove("esta-cargando");
    mostrarPreguntaActual();
    esperandoRespuesta = true;
    ultimoTic = performance.now();
}

/**
 * Pinta la pregunta actual (o la que se revisa): cabecera, marcador,
 * reloj, enunciado y botones. Si ya está respondida, la deja marcada.
 */
export function mostrarPreguntaActual(): void {
    const { tema, modo, historial, enRevision, indiceRevision } = estadoPartida;
    const indice = enRevision ? indiceRevision : historial.length - 1;
    const registro = historial[indice];
    if (!registro) {
        return;
    }
    const numero = indice + 1;
    const idioma = obtenerIdioma();

    if (tema) {
        elementos.insigniaTema.textContent = `${tema.icono} ${tema.nombre[idioma]}`;
    }
    elementos.insigniaModo.textContent = `${modo.icono} ${modo.nombre[idioma]}`;
    const total = enRevision ? historial.length : modo.totalPreguntas;
    elementos.contadorPreguntas.textContent = total
        ? `${texto("pregunta")} ${numero} ${texto("de")} ${total}`
        : `${texto("pregunta")} ${numero}`;

    elementos.barraProgreso.hidden = !total;
    if (total) {
        elementos.barraProgresoRelleno.style.width = `${(numero / total) * 100}%`;
    }
    elementos.numeroEnunciado.textContent = `#${String(numero).padStart(2, "0")}`;
    elementos.textoEnunciado.textContent = registro.pregunta.enunciado;
    elementos.avisoLocal.hidden = !estadoPartida.preguntasLocales || enRevision;

    elementos.listaRespuestas.replaceChildren(
        ...registro.pregunta.respuestas.map((respuesta, indiceRespuesta) =>
            crearBotonRespuesta(respuesta.texto, indiceRespuesta, registro.respondida || enRevision),
        ),
    );
    if (registro.respondida) {
        marcarCorrectaYElegida(registro);
    }

    elementos.marcador.hidden = enRevision;
    elementos.controlesJuego.hidden = enRevision;
    elementos.controlesRevision.hidden = !enRevision;
    if (enRevision) {
        elementos.barraTiempo.hidden = true;
        elementos.botonAnterior.disabled = indiceRevision === 0;
        elementos.botonSiguiente.disabled = indiceRevision === historial.length - 1;
    } else {
        pintarMarcador();
        pintarReloj();
    }
}

/**
 * Crea el botón de una respuesta.
 * @param textoRespuesta Texto de la respuesta.
 * @param indiceRespuesta Posición de la respuesta.
 * @param desactivado Si no se puede pulsar (ya respondida o en revisión).
 */
function crearBotonRespuesta(textoRespuesta: string, indiceRespuesta: number, desactivado: boolean): HTMLButtonElement {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "boton-respuesta";
    // Las respuestas tienen su propio sonido (acierto/fallo), no el clic general.
    boton.dataset.sinClic = "";

    const letra = document.createElement("span");
    letra.className = "letra-respuesta";
    letra.setAttribute("aria-hidden", "true");
    letra.textContent = LETRAS_RESPUESTAS[indiceRespuesta] ?? "";

    const contenido = document.createElement("span");
    contenido.textContent = textoRespuesta;

    boton.append(letra, contenido);
    boton.disabled = desactivado;
    boton.addEventListener("click", () => void responderPregunta(indiceRespuesta));
    return boton;
}

/** Devuelve los botones de respuesta que hay en pantalla. */
function obtenerBotonesRespuesta(): HTMLButtonElement[] {
    return [...elementos.listaRespuestas.querySelectorAll<HTMLButtonElement>(".boton-respuesta")];
}

/**
 * Colorea la respuesta correcta en verde y, si la elegida es otra, en rojo.
 * @param registro Pregunta respondida.
 */
function marcarCorrectaYElegida(registro: RegistroPregunta): void {
    obtenerBotonesRespuesta().forEach((boton, indice) => {
        const esCorrecta = registro.pregunta.respuestas[indice].esCorrecta;
        boton.classList.toggle("es-correcta", esCorrecta);
        boton.classList.toggle("es-incorrecta", indice === registro.elegida && !esCorrecta);
        boton.classList.toggle("es-elegida", indice === registro.elegida);
    });
}

/** Pinta puntos, racha y vidas. */
function pintarMarcador(): void {
    const { puntos, racha, vidas, modo } = estadoPartida;
    elementos.marcadorPuntos.textContent = formatearPuntos(puntos, obtenerIdioma());
    elementos.marcadorRacha.hidden = racha < 2;
    elementos.marcadorRacha.textContent = `🔥 ${racha}`;
    elementos.marcadorRacha.title = texto("racha");
    elementos.marcadorVidas.hidden = modo.vidas === null;
    if (modo.vidas !== null && vidas !== null) {
        elementos.marcadorVidas.textContent = "❤️".repeat(Math.max(vidas, 0)) + "🖤".repeat(modo.vidas - Math.max(vidas, 0));
        elementos.marcadorVidas.setAttribute("aria-label", `${texto("vidas")}: ${vidas}`);
    }
}

/** Pinta el reloj (número y barra) si el modo tiene tiempo. */
function pintarReloj(): void {
    const reloj = relojVisible();
    elementos.marcadorTiempo.hidden = reloj === null;
    elementos.barraTiempo.hidden = reloj === null;
    if (!reloj) {
        return;
    }
    const restantes = Math.max(reloj.restantes, 0);
    elementos.marcadorTiempo.textContent = `⏱ ${Math.ceil(restantes)} s`;
    elementos.barraTiempoRelleno.style.width = `${(restantes / reloj.maximo) * 100}%`;
    const urgente = restantes <= SEGUNDOS_DE_AVISO;
    elementos.marcadorTiempo.classList.toggle("es-urgente", urgente);
    elementos.barraTiempo.classList.toggle("es-urgente", urgente);
}

/**
 * Enseña un texto flotante junto a los puntos ("+140", "-3 s"…).
 * @param contenido Texto a mostrar.
 * @param negativo Si es una penalización (se pinta en rojo).
 */
function mostrarAvisoFlotante(contenido: string, negativo = false): void {
    const aviso = elementos.puntosGanados;
    aviso.textContent = contenido;
    aviso.classList.toggle("es-negativo", negativo);
    aviso.classList.remove("es-visible");
    void aviso.offsetWidth; // Reinicia la animación.
    aviso.classList.add("es-visible");
}

/** Indica si la partida debe acabar tras la última respuesta. */
function debeTerminar(): boolean {
    const { modo, vidas, historial, segundosTotales } = estadoPartida;
    return (
        (vidas !== null && vidas <= 0) ||
        (modo.totalPreguntas !== null && historial.length >= modo.totalPreguntas) ||
        (modo.segundosTotales !== null && segundosTotales <= 0)
    );
}

/**
 * Guarda la respuesta (o que se acabó el tiempo), suma puntos o quita vida,
 * la marca en verde o rojo y, tras una pausa, pasa a la siguiente pregunta
 * o a los resultados.
 * @param indiceRespuesta Posición de la respuesta pulsada, o null si se acabó el tiempo.
 */
async function responderPregunta(indiceRespuesta: number | null): Promise<void> {
    const registro = obtenerRegistroActual();
    if (!esperandoRespuesta || !registro || registro.respondida) {
        return;
    }
    esperandoRespuesta = false;
    const miGeneracion = generacion;
    const { modo } = estadoPartida;

    registro.respondida = true;
    registro.elegida = indiceRespuesta;
    registro.acertada = indiceRespuesta !== null && registro.pregunta.respuestas[indiceRespuesta].esCorrecta;

    if (registro.acertada) {
        estadoPartida.racha++;
        estadoPartida.mejorRacha = Math.max(estadoPartida.mejorRacha, estadoPartida.racha);
        estadoPartida.aciertos++;
        registro.puntos = calcularPuntosAcierto({
            racha: estadoPartida.racha,
            segundosRestantes: estadoPartida.segundosPregunta,
            segundosPorPregunta: modo.segundosPorPregunta,
            multiplicador: modo.multiplicador,
        });
        estadoPartida.puntos += registro.puntos;
        mostrarAvisoFlotante(`+${registro.puntos}`);
    } else {
        estadoPartida.racha = 0;
        if (modo.perderTodoAlFallar && estadoPartida.puntos > 0) {
            // Todo o nada: el fallo se lleva todos los puntos.
            mostrarAvisoFlotante(`-${formatearPuntos(estadoPartida.puntos, obtenerIdioma())}`, true);
            estadoPartida.puntos = 0;
        }
        if (estadoPartida.vidas !== null) {
            estadoPartida.vidas--;
            elementos.marcadorVidas.classList.remove("pierde-vida");
            void elementos.marcadorVidas.offsetWidth;
            elementos.marcadorVidas.classList.add("pierde-vida");
        }
        if (modo.penalizacionPorFallo > 0) {
            estadoPartida.segundosTotales -= modo.penalizacionPorFallo;
            mostrarAvisoFlotante(`-${modo.penalizacionPorFallo} s`, true);
            pintarReloj();
        }
    }

    obtenerBotonesRespuesta().forEach((boton) => (boton.disabled = true));
    marcarCorrectaYElegida(registro);
    pintarMarcador();
    reproducirEfecto(registro.acertada ? "acierto" : "fallo");

    await esperar(modo.segundosTotales !== null ? PAUSA_TRAS_RESPONDER_RAPIDA : PAUSA_TRAS_RESPONDER);
    if (miGeneracion !== generacion) return;

    if (debeTerminar()) {
        terminarPartida();
        return;
    }

    elementos.tarjetaPregunta.classList.add("esta-cargando");
    try {
        const siguiente = await (fuente as FuentePreguntas).siguiente();
        if (miGeneracion !== generacion) return;
        presentarPregunta(siguiente);
        elementos.enunciado.focus({ preventScroll: true });
    } catch {
        if (miGeneracion !== generacion) return;
        // No hay más preguntas disponibles: se termina con lo conseguido.
        terminarPartida();
    }
}

/* ---------- Resultados ---------- */

/** Termina la partida: guarda el récord, compara con los amigos y enseña los resultados. */
export function terminarPartida(): void {
    if (!estadoPartida.enJuego) {
        return;
    }
    generacion++;
    fuente?.detener();
    detenerReloj();
    esperandoRespuesta = false;
    estadoPartida.enJuego = false;
    estadoPartida.enRevision = false;
    // Una pregunta en pantalla sin responder (al pulsar "Terminar") no cuenta.
    estadoPartida.historial = estadoPartida.historial.filter((registro) => registro.respondida);
    elementos.tarjetaPregunta.classList.remove("esta-cargando");

    const { modo, puntos, aciertos, historial, tema } = estadoPartida;
    const total = historial.length;
    elementos.avisoGuardado.hidden = true;
    elementos.avisoInvitado.hidden = true;

    if (obtenerPerfil()) {
        // Con sesión: el récord lo decide el servidor; mientras responde se usa el local.
        ultimoNuevoRecord = puntos > leerRecord(modo.id).mejor;
        void guardarPartidaOnline();
    } else {
        ultimoNuevoRecord = registrarPartidaLocal(modo.id, puntos).nuevoRecord && puntos > 0;
        elementos.avisoInvitado.hidden = !hayOnline();
    }
    ultimaVictoria = ultimoNuevoRecord || (total > 0 && aciertos / total >= PORCENTAJE_PARA_GANAR);
    pintarResultados();
    mostrarPantalla("resultados");
    reproducirEfecto(ultimaVictoria ? "victoria" : "derrota");

    /** Guarda la partida en Supabase y repinta con el resultado del servidor. */
    async function guardarPartidaOnline(): Promise<void> {
        elementos.avisoGuardado.hidden = false;
        elementos.avisoGuardado.textContent = texto("guardando");
        try {
            const resultado = await registrarPartidaOnline({ modo: modo.id, tema: tema?.id ?? "", puntos, aciertos, total });
            ultimoNuevoRecord = resultado.nuevoRecord && puntos > 0;
            pintarResultados();
            elementos.avisoGuardado.textContent = `+${formatearPuntos(puntos, obtenerIdioma())} ${texto("puntosSumados")} · ${texto("total")}: ${formatearPuntos(resultado.puntosTotales, obtenerIdioma())}`;
            void mostrarComparacionConAmigos(modo.id);
        } catch (error) {
            elementos.avisoGuardado.textContent = mensajeDeErrorCuenta(error);
        }
    }
}

/**
 * Elige el mensaje final: récord, o según el porcentaje de aciertos.
 * @param aciertos Preguntas acertadas.
 * @param total Preguntas respondidas.
 */
function elegirMensajeFinal(aciertos: number, total: number): string {
    if (ultimoNuevoRecord) return texto("mensajeRecord");
    if (!ultimaVictoria && estadoPartida.modo.vidas !== null && (estadoPartida.vidas ?? 1) <= 0) return texto("mensajeSinVidas");
    const porcentaje = total === 0 ? 0 : aciertos / total;
    if (porcentaje === 1) return texto("mensajePerfecto");
    if (porcentaje >= 0.7) return texto("mensajeBueno");
    if (porcentaje >= 0.4) return texto("mensajeRegular");
    return texto("mensajeMalo");
}

/** Pinta la pantalla de resultados (también al cambiar de idioma). */
export function pintarResultados(): void {
    const { modo, tema, historial, aciertos, puntos, mejorRacha } = estadoPartida;
    const idioma = obtenerIdioma();
    const total = historial.length;

    elementos.modoResultados.textContent = `${modo.icono} ${modo.nombre[idioma]}`;
    elementos.temaResultados.textContent = tema ? `${tema.icono} ${tema.nombre[idioma]}` : "";
    elementos.mensajeResultado.textContent = elegirMensajeFinal(aciertos, total);
    elementos.puntosFinales.textContent = formatearPuntos(puntos, idioma);
    elementos.avisoRecord.hidden = !ultimoNuevoRecord;
    elementos.puntuacion.textContent = `${aciertos}/${total}`;
    elementos.porcentaje.textContent = `${total === 0 ? 0 : Math.round((aciertos / total) * 100)}%`;
    elementos.mejorRacha.textContent = String(mejorRacha);
    elementos.recordModo.textContent = formatearPuntos(leerRecord(modo.id).mejor, idioma);
    elementos.botonRevisar.hidden = total === 0;
}

/** Abre el registro desde el aviso de invitado de los resultados. */
export function conectarAvisoInvitado(): void {
    elementos.avisoInvitado.querySelector("button")?.addEventListener("click", () => abrirEntrar("registro"));
}

/** Vuelve a la pantalla de resultados (desde la revisión). */
export function mostrarResultados(): void {
    estadoPartida.enRevision = false;
    mostrarPantalla("resultados");
}

/** Entra en modo revisión desde la primera pregunta. */
export function empezarRevision(): void {
    if (estadoPartida.historial.length === 0) {
        return;
    }
    estadoPartida.enRevision = true;
    estadoPartida.indiceRevision = 0;
    mostrarPreguntaActual();
    mostrarPantalla("pregunta");
}

/**
 * Avanza o retrocede una pregunta en modo revisión.
 * @param direccion +1 para siguiente, -1 para anterior.
 */
export function moverRevision(direccion: 1 | -1): void {
    const nuevoIndice = estadoPartida.indiceRevision + direccion;
    if (nuevoIndice >= 0 && nuevoIndice < estadoPartida.historial.length) {
        estadoPartida.indiceRevision = nuevoIndice;
        mostrarPreguntaActual();
    }
}

/**
 * Cambia el idioma de la partida en curso: traduce las preguntas ya
 * salidas (desde su texto original) y las que quedan por salir. El reloj
 * se para mientras se traduce la pregunta en pantalla.
 * @param idioma Idioma nuevo.
 */
export async function cambiarIdiomaPartida(idioma: Idioma): Promise<void> {
    if (estadoPartida.historial.length === 0) {
        return;
    }
    const miGeneracion = generacion;
    traduciendo = true;
    elementos.tarjetaPregunta.classList.add("esta-cargando");
    try {
        const traducidas = await adaptarPreguntasAlIdioma(
            estadoPartida.historial.map((registro) => registro.pregunta),
            idioma,
        );
        // Si mientras tanto empezó otra partida, no se toca nada.
        if (miGeneracion !== generacion && estadoPartida.enJuego) return;
        estadoPartida.historial.forEach((registro, posicion) => {
            if (traducidas[posicion]) registro.pregunta = traducidas[posicion];
        });
    } finally {
        traduciendo = false;
        ultimoTic = performance.now();
        elementos.tarjetaPregunta.classList.remove("esta-cargando");
    }
    if (estadoPartida.enJuego || estadoPartida.enRevision) {
        mostrarPreguntaActual();
    }
    if (estadoPartida.enJuego) {
        void fuente?.cambiarIdioma(idioma);
    }
}

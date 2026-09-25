/**
 * efectos.ts
 * Efectos de sonido del juego (acierto, fallo, giro de la tragaperras, tema
 * elegido) y el "clic" de los botones, todos con un volumen común ajustable.
 * Los MP3 no se descargan hasta que suenan por primera vez, para que la
 * página cargue rápido. El clic se sintetiza con Web Audio (sin archivos).
 */

/** Efectos disponibles y su archivo. */
const ARCHIVOS_DE_EFECTOS = {
    acierto: "sfx/acierto.mp3",
    fallo: "sfx/fallo.mp3",
    giro: "sfx/giro.mp3",
    temaElegido: "sfx/tema-elegido.mp3",
} as const;

/** Nombre de un efecto de sonido. */
export type NombreEfecto = keyof typeof ARCHIVOS_DE_EFECTOS;

/** Reproductores ya creados (se crean la primera vez que se usan). */
const reproductores = new Map<NombreEfecto, HTMLAudioElement>();

/** Volumen de los efectos entre 0 y 1. */
let volumenEfectos = 0.7;

/** Contexto de Web Audio para el clic (se crea tras la primera interacción). */
let contextoAudio: AudioContext | null = null;

/**
 * Cambia el volumen de todos los efectos.
 * @param volumen Valor entre 0 y 1.
 */
export function establecerVolumenEfectos(volumen: number): void {
    volumenEfectos = Math.min(1, Math.max(0, volumen));
    reproductores.forEach((reproductor) => (reproductor.volume = volumenEfectos));
}

/**
 * Devuelve (creándolo si hace falta) el reproductor de un efecto.
 * @param nombre Efecto.
 */
function obtenerReproductor(nombre: NombreEfecto): HTMLAudioElement {
    let reproductor = reproductores.get(nombre);
    if (!reproductor) {
        reproductor = new Audio(ARCHIVOS_DE_EFECTOS[nombre]);
        reproductores.set(nombre, reproductor);
    }
    reproductor.volume = volumenEfectos;
    return reproductor;
}

/**
 * Reproduce un efecto desde el principio.
 * @param nombre Efecto a reproducir.
 */
export function reproducirEfecto(nombre: NombreEfecto): void {
    if (volumenEfectos === 0) {
        return;
    }
    const reproductor = obtenerReproductor(nombre);
    reproductor.currentTime = 0;
    // play() falla si el navegador bloquea el audio; no es un error del juego.
    reproductor.play().catch(() => {});
}

/**
 * Detiene un efecto que esté sonando.
 * @param nombre Efecto a detener.
 */
export function detenerEfecto(nombre: NombreEfecto): void {
    const reproductor = reproductores.get(nombre);
    if (reproductor) {
        reproductor.pause();
        reproductor.currentTime = 0;
    }
}

/**
 * Reproduce un "clic" corto de botón generado con un oscilador.
 * @param tono Frecuencia inicial en Hz (más alto = más agudo).
 */
export function reproducirClic(tono = 660): void {
    if (volumenEfectos === 0) {
        return;
    }
    try {
        contextoAudio ??= new AudioContext();
        const ahora = contextoAudio.currentTime;
        const oscilador = contextoAudio.createOscillator();
        const ganancia = contextoAudio.createGain();

        oscilador.type = "triangle";
        oscilador.frequency.setValueAtTime(tono, ahora);
        oscilador.frequency.exponentialRampToValueAtTime(tono * 1.5, ahora + 0.06);

        ganancia.gain.setValueAtTime(0.0001, ahora);
        ganancia.gain.exponentialRampToValueAtTime(0.25 * volumenEfectos + 0.0001, ahora + 0.01);
        ganancia.gain.exponentialRampToValueAtTime(0.0001, ahora + 0.12);

        oscilador.connect(ganancia).connect(contextoAudio.destination);
        oscilador.start(ahora);
        oscilador.stop(ahora + 0.13);
    } catch {
        // Navegador sin Web Audio: simplemente no suena el clic.
    }
}

/**
 * efectos.ts
 * Todos los sonidos del juego, sintetizados con Web Audio (no hay archivos
 * de audio que descargar):
 *   clic      Botones.
 *   acierto   Respuesta correcta: dos notas que suben.
 *   fallo     Respuesta incorrecta: zumbido grave que baja.
 *   victoria  Partida ganada: arpegio con acorde final.
 *   derrota   Partida perdida: cuatro notas que caen.
 *   giro      Tic-tac de los rodillos girando (se frena poco a poco).
 *   tema      Campanilla al pararse los rodillos.
 *   tic       Aviso de los últimos segundos.
 * El volumen es común a todos y se ajusta en Ajustes.
 */

/** Efectos disponibles. */
export type NombreEfecto = "clic" | "acierto" | "fallo" | "victoria" | "derrota" | "giro" | "tema" | "tic";

/** Volumen de los efectos entre 0 y 1. */
let volumenEfectos = 0.7;

/** Contexto de audio (se crea tras la primera interacción del jugador). */
let contexto: AudioContext | null = null;
/** Ganancia general a la que se conecta todo. */
let salida: GainNode | null = null;
/** Osciladores del giro, para poder cortarlo. */
let osciladoresGiro: OscillatorNode[] = [];

/** Forma de onda de un oscilador. */
type Onda = OscillatorType;

/** Opciones de una nota. */
interface OpcionesNota {
    /** Segundos desde ahora en que empieza. */
    inicio?: number;
    duracion?: number;
    onda?: Onda;
    /** Volumen relativo (0-1). */
    volumen?: number;
    /** Frecuencia final si la nota se desliza. */
    deslizarA?: number;
    /** Frecuencia de corte de un filtro paso bajo (para suavizar ondas ásperas). */
    filtro?: number;
}

/**
 * Cambia el volumen de todos los efectos.
 * @param volumen Valor entre 0 y 1.
 */
export function establecerVolumenEfectos(volumen: number): void {
    volumenEfectos = Math.min(1, Math.max(0, volumen));
    if (salida) {
        salida.gain.value = volumenEfectos;
    }
}

/** Devuelve el contexto de audio listo para sonar, o null si no se puede. */
function prepararAudio(): { ctx: AudioContext; destino: GainNode } | null {
    if (volumenEfectos === 0) {
        return null;
    }
    try {
        if (!contexto) {
            contexto = new AudioContext();
            salida = contexto.createGain();
            salida.gain.value = volumenEfectos;
            salida.connect(contexto.destination);
        }
        if (contexto.state === "suspended") {
            void contexto.resume();
        }
        return { ctx: contexto, destino: salida as GainNode };
    } catch {
        // Navegador sin Web Audio: el juego sigue sin sonido.
        return null;
    }
}

/**
 * Toca una nota con envolvente corta (ataque rápido y caída exponencial).
 * @param frecuencia Frecuencia en Hz.
 * @param opciones Momento, duración, onda, volumen, deslizamiento y filtro.
 * @returns El oscilador (o null si no hay audio).
 */
function nota(frecuencia: number, opciones: OpcionesNota = {}): OscillatorNode | null {
    const audio = prepararAudio();
    if (!audio) {
        return null;
    }
    const { ctx, destino } = audio;
    const { inicio = 0, duracion = 0.15, onda = "triangle", volumen = 0.3, deslizarA, filtro } = opciones;
    const t0 = ctx.currentTime + inicio;

    const oscilador = ctx.createOscillator();
    oscilador.type = onda;
    oscilador.frequency.setValueAtTime(frecuencia, t0);
    if (deslizarA) {
        oscilador.frequency.exponentialRampToValueAtTime(deslizarA, t0 + duracion);
    }

    const envolvente = ctx.createGain();
    envolvente.gain.setValueAtTime(0.0001, t0);
    envolvente.gain.exponentialRampToValueAtTime(volumen, t0 + 0.01);
    envolvente.gain.exponentialRampToValueAtTime(0.0001, t0 + duracion);

    let ultimo: AudioNode = oscilador;
    if (filtro) {
        const pasoBajo = ctx.createBiquadFilter();
        pasoBajo.type = "lowpass";
        pasoBajo.frequency.value = filtro;
        oscilador.connect(pasoBajo);
        ultimo = pasoBajo;
    }
    ultimo.connect(envolvente);
    envolvente.connect(destino);
    oscilador.start(t0);
    oscilador.stop(t0 + duracion + 0.05);
    return oscilador;
}

/** Tic-tac de los rodillos: pulsos cada vez más separados durante ~2 s. */
function sonarGiro(): void {
    detenerGiro();
    let momento = 0;
    let separacion = 0.045;
    while (momento < 2.3) {
        const oscilador = nota(momento % 0.2 < 0.1 ? 1300 : 1100, {
            inicio: momento,
            duracion: 0.03,
            onda: "square",
            volumen: 0.07,
            filtro: 3000,
        });
        if (oscilador) {
            osciladoresGiro.push(oscilador);
        }
        momento += separacion;
        separacion *= 1.045;
    }
}

/** Corta el tic-tac del giro si sigue sonando. */
function detenerGiro(): void {
    osciladoresGiro.forEach((oscilador) => {
        try {
            oscilador.stop();
        } catch {
            // Ya había terminado.
        }
    });
    osciladoresGiro = [];
}

/**
 * Reproduce un efecto.
 * @param nombre Efecto a reproducir.
 */
export function reproducirEfecto(nombre: NombreEfecto): void {
    switch (nombre) {
        case "clic":
            nota(620, { duracion: 0.07, volumen: 0.14, deslizarA: 930 });
            break;
        case "acierto":
            nota(784, { duracion: 0.13, volumen: 0.28 });
            nota(1175, { inicio: 0.09, duracion: 0.28, volumen: 0.28 });
            nota(2350, { inicio: 0.09, duracion: 0.2, onda: "sine", volumen: 0.06 });
            break;
        case "fallo":
            nota(220, { duracion: 0.18, onda: "sawtooth", volumen: 0.18, deslizarA: 160, filtro: 900 });
            nota(180, { inicio: 0.16, duracion: 0.32, onda: "sawtooth", volumen: 0.18, deslizarA: 110, filtro: 700 });
            break;
        case "victoria":
            [523, 659, 784, 1047].forEach((frecuencia, posicion) =>
                nota(frecuencia, { inicio: posicion * 0.1, duracion: 0.16, volumen: 0.24 }),
            );
            [1047, 1319, 1568].forEach((frecuencia) =>
                nota(frecuencia, { inicio: 0.42, duracion: 0.9, onda: "sine", volumen: 0.16 }),
            );
            nota(523, { inicio: 0.42, duracion: 0.9, volumen: 0.14 });
            break;
        case "derrota":
            [392, 370, 349].forEach((frecuencia, posicion) =>
                nota(frecuencia, { inicio: posicion * 0.26, duracion: 0.24, onda: "sawtooth", volumen: 0.14, filtro: 1200 }),
            );
            nota(330, { inicio: 0.78, duracion: 0.8, onda: "sawtooth", volumen: 0.14, deslizarA: 262, filtro: 900 });
            break;
        case "giro":
            sonarGiro();
            break;
        case "tema":
            nota(1047, { duracion: 0.6, onda: "sine", volumen: 0.22 });
            nota(1568, { inicio: 0.06, duracion: 0.7, onda: "sine", volumen: 0.16 });
            nota(2093, { inicio: 0.12, duracion: 0.5, onda: "sine", volumen: 0.08 });
            break;
        case "tic":
            nota(1000, { duracion: 0.05, onda: "square", volumen: 0.08, filtro: 2500 });
            break;
    }
}

/**
 * Detiene un efecto largo que esté sonando (solo el giro dura lo bastante).
 * @param nombre Efecto a detener.
 */
export function detenerEfecto(nombre: NombreEfecto): void {
    if (nombre === "giro") {
        detenerGiro();
    }
}

/**
 * Golpe corto de un rodillo al pararse (más agudo en cada rodillo).
 * @param tono Frecuencia en Hz.
 */
export function reproducirParadaRodillo(tono: number): void {
    nota(tono, { duracion: 0.09, onda: "square", volumen: 0.12, deslizarA: tono * 0.7, filtro: 2200 });
}

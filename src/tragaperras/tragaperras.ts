/**
 * tragaperras.ts
 * La máquina tragaperras que elige el tema: al tirar de la palanca los tres
 * rodillos giran y se paran uno detrás de otro mostrando el mismo icono,
 * el del tema elegido al azar.
 *
 * Cada rodillo es una "tira" vertical de iconos dentro de una ventana que
 * solo deja ver uno. Para girar se rellena la tira con iconos al azar
 * terminando en el ganador y se desplaza hacia arriba con una transición CSS.
 */

import { reproducirParadaRodillo } from "../audio/efectos";
import type { Tema } from "../config/temas";
import { TEMAS } from "../config/temas";
import { elegirAlAzar } from "../utilidades/aleatorio";

/** Iconos al azar que pasan por el primer rodillo antes de pararse. */
const ICONOS_POR_GIRO = 24;
/** Iconos extra por cada rodillo siguiente (para que paren escalonados). */
const ICONOS_EXTRA_POR_RODILLO = 8;
/** Duración del giro del primer rodillo (ms). */
const DURACION_PRIMER_RODILLO = 1500;
/** Tiempo extra de giro de cada rodillo siguiente (ms). */
const RETRASO_ENTRE_RODILLOS = 550;
/** Duración con "reducir movimiento" activado en el sistema (ms). */
const DURACION_MOVIMIENTO_REDUCIDO = 250;

/**
 * Crea el elemento de un icono de la tira.
 * @param icono Emoji del tema.
 */
function crearSimbolo(icono: string): HTMLElement {
    const simbolo = document.createElement("span");
    simbolo.className = "simbolo";
    simbolo.textContent = icono;
    return simbolo;
}

/**
 * Pone un icono al azar en cada rodillo (estado inicial de la máquina).
 * @param tiras Tiras de los rodillos.
 */
export function prepararRodillos(tiras: readonly HTMLElement[]): void {
    tiras.forEach((tira) => {
        tira.style.transition = "none";
        tira.style.transform = "translateY(0)";
        tira.replaceChildren(crearSimbolo(elegirAlAzar(TEMAS).icono));
    });
}

/**
 * Indica si el usuario ha pedido al sistema reducir las animaciones.
 */
function prefiereMovimientoReducido(): boolean {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Hace girar un rodillo y espera a que se pare en el icono ganador.
 * @param tira Tira del rodillo.
 * @param iconoGanador Icono en el que debe pararse.
 * @param posicion Posición del rodillo (0, 1, 2), para escalonar la parada.
 */
function girarRodillo(tira: HTMLElement, iconoGanador: string, posicion: number): Promise<void> {
    const iconoVisible = tira.lastElementChild?.textContent ?? elegirAlAzar(TEMAS).icono;
    const cantidadAlAzar = ICONOS_POR_GIRO + posicion * ICONOS_EXTRA_POR_RODILLO;
    const iconos = [
        iconoVisible,
        ...Array.from({ length: cantidadAlAzar }, () => elegirAlAzar(TEMAS).icono),
        iconoGanador,
    ];

    // Se vuelve al principio sin animación con el icono que ya se veía arriba.
    tira.style.transition = "none";
    tira.style.transform = "translateY(0)";
    tira.replaceChildren(...iconos.map(crearSimbolo));
    void tira.offsetHeight; // Obliga al navegador a aplicar la posición inicial.

    const duracion = prefiereMovimientoReducido()
        ? DURACION_MOVIMIENTO_REDUCIDO
        : DURACION_PRIMER_RODILLO + posicion * RETRASO_ENTRE_RODILLOS;

    tira.style.transition = `transform ${duracion}ms cubic-bezier(0.12, 0.8, 0.22, 1.04)`;
    tira.style.transform = `translateY(calc(var(--altura-simbolo) * -${iconos.length - 1}))`;

    return new Promise((resolver) => {
        setTimeout(() => {
            reproducirParadaRodillo(420 + posicion * 110);
            tira.parentElement?.classList.add("ventana--parada");
            resolver();
        }, duracion);
    });
}

/**
 * Gira los tres rodillos y los para en el icono del tema indicado.
 * @param tiras Tiras de los rodillos.
 * @param temaGanador Tema en el que deben pararse todos.
 */
export async function girarRodillos(tiras: readonly HTMLElement[], temaGanador: Tema): Promise<void> {
    // La clase "girando" acelera las luces y difumina los rodillos en movimiento.
    const maquina = tiras[0]?.closest(".maquina");
    maquina?.classList.remove("hay-premio");
    maquina?.classList.add("girando");
    tiras.forEach((tira) => tira.parentElement?.classList.remove("ventana--parada"));
    await Promise.all(tiras.map((tira, posicion) => girarRodillo(tira, temaGanador.icono, posicion)));
    maquina?.classList.remove("girando");
    maquina?.classList.add("hay-premio");
}

/** Recorrido de la palanca al tirar de ella (px); coincide con el CSS (--recorrido-palanca). */
const RECORRIDO_PALANCA = 120;
/** Fracción del recorrido a partir de la cual cuenta como tirada. */
const UMBRAL_TIRON = 0.75;
/** Tiempo que la palanca se queda abajo antes de volver (ms). */
const TIEMPO_ABAJO = 180;

/**
 * Pone la palanca en una posición.
 * @param palanca Botón de la palanca.
 * @param tiron 0 = arriba, 1 = abajo del todo.
 */
function moverPalanca(palanca: HTMLElement, tiron: number): void {
    palanca.style.setProperty("--tiron", String(Math.min(Math.max(tiron, 0), 1)));
}

/**
 * Hace que la palanca funcione como en una tragaperras de verdad:
 *   - Arrastrándola hacia abajo (ratón o dedo); si baja lo suficiente, se tira.
 *   - Con un clic o un toque, baja y sube sola.
 *   - Con el teclado (Intro o Espacio), igual que con un clic.
 * @param palanca Botón de la palanca.
 * @param alTirar Se llama cuando se tira de la palanca.
 * @returns Función que tira de la palanca con su animación (para la tecla Espacio).
 */
export function conectarPalanca(palanca: HTMLButtonElement, alTirar: () => void): () => void {
    let inicioY: number | null = null;
    let tiron = 0;
    let yaTirada = false;

    /** Baja la palanca del todo, avisa y la devuelve arriba. */
    const tirar = () => {
        if (palanca.disabled) return;
        yaTirada = true;
        palanca.classList.remove("arrastrando");
        moverPalanca(palanca, 1);
        reproducirParadaRodillo(260);
        alTirar();
        setTimeout(() => moverPalanca(palanca, 0), TIEMPO_ABAJO);
    };

    palanca.addEventListener("pointerdown", (evento) => {
        if (palanca.disabled || evento.button !== 0) return;
        inicioY = evento.clientY;
        tiron = 0;
        yaTirada = false;
        try {
            palanca.setPointerCapture(evento.pointerId);
        } catch {
            // Algunos navegadores no dejan capturar el puntero: se arrastra igual.
        }
        palanca.classList.add("arrastrando");
    });
    palanca.addEventListener("pointermove", (evento) => {
        if (inicioY === null || yaTirada) return;
        tiron = (evento.clientY - inicioY) / RECORRIDO_PALANCA;
        moverPalanca(palanca, tiron);
        if (tiron >= UMBRAL_TIRON) tirar();
    });
    const soltar = () => {
        if (inicioY === null) return;
        inicioY = null;
        palanca.classList.remove("arrastrando");
        // Un toque sin arrastrar cuenta como tirar; un arrastre corto no.
        if (!yaTirada && tiron < 0.05) {
            tirar();
        } else if (!yaTirada) {
            moverPalanca(palanca, 0);
        }
    };
    palanca.addEventListener("pointerup", soltar);
    palanca.addEventListener("pointercancel", () => {
        inicioY = null;
        palanca.classList.remove("arrastrando");
        moverPalanca(palanca, 0);
    });
    // Teclado: Intro y Espacio generan un "click" sin puntero (detail = 0).
    palanca.addEventListener("click", (evento) => {
        if (evento.detail === 0) tirar();
    });
    return tirar;
}

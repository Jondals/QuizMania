/**
 * perfil.ts
 * Perfil del jugador: nombre, avatar (emoji) y color de fondo del avatar.
 * Se guarda en el navegador y se sube al servidor cuando hace falta (al
 * abrir el perfil, al cambiarlo o al terminar una partida). El servidor le
 * da un código de amigo, que también se recuerda aquí.
 */

import { AVATARES, COLORES_AVATAR, limpiarNombre, LONGITUD_MAXIMA_NOMBRE } from "../../api/_lib/compartido";
import { texto } from "../i18n/textos";
import { ErrorOnline, prepararPerfil, sincronizarPerfil } from "../online/cliente";
import { elegirAlAzar } from "../utilidades/aleatorio";
import { guardarDato, leerDatoGuardado } from "../utilidades/almacenamiento";
import { obtenerElemento } from "../utilidades/dom";

const CLAVE_PERFIL = "perfil";

/** Evento que se lanza en document cuando cambia el perfil o su código. */
export const EVENTO_PERFIL_CAMBIADO = "quizmania:perfil-cambiado";

/** Datos del perfil. */
export interface Perfil {
    nombre: string;
    avatar: string;
    color: string;
    /** Código de amigo (lo asigna el servidor). */
    codigo: string | null;
}

/** Crea un perfil nuevo con un nombre y avatar al azar. */
function crearPerfilNuevo(): Perfil {
    return {
        nombre: `Jugador ${Math.floor(1000 + Math.random() * 9000)}`,
        avatar: elegirAlAzar(AVATARES),
        color: elegirAlAzar(COLORES_AVATAR),
        codigo: null,
    };
}

let perfil: Perfil = crearPerfilNuevo();
/** Si el perfil ha cambiado desde la última subida al servidor. */
let cambiosSinSubir = false;

const elementos = {
    botonPerfil: obtenerElemento("boton-perfil", HTMLButtonElement),
    avatarCabecera: obtenerElemento("avatar-cabecera"),
    nombreCabecera: obtenerElemento("nombre-cabecera"),
    dialogo: obtenerElemento("dialogo-perfil", HTMLDialogElement),
    vistaAvatar: obtenerElemento("vista-avatar"),
    campoNombre: obtenerElemento("campo-nombre", HTMLInputElement),
    rejillaAvatares: obtenerElemento("rejilla-avatares"),
    rejillaColores: obtenerElemento("rejilla-colores"),
    codigo: obtenerElemento("codigo-perfil"),
    mensajeCodigo: obtenerElemento("mensaje-codigo-perfil"),
};

/** Devuelve una copia del perfil actual. */
export function obtenerPerfil(): Perfil {
    return { ...perfil };
}

/**
 * Pinta un avatar (emoji sobre un círculo de color) en un elemento.
 * @param elemento Elemento con la clase "avatar".
 * @param avatar Emoji.
 * @param color Color de fondo.
 */
export function pintarAvatar(elemento: HTMLElement, avatar: string, color: string): void {
    elemento.textContent = avatar;
    elemento.style.setProperty("--color-avatar", color);
}

/** Guarda el perfil, repinta la cabecera y avisa al resto del juego. */
function guardarPerfil(): void {
    guardarDato(CLAVE_PERFIL, perfil);
    prepararPerfil(perfil);
    pintarAvatar(elementos.avatarCabecera, perfil.avatar, perfil.color);
    pintarAvatar(elementos.vistaAvatar, perfil.avatar, perfil.color);
    elementos.nombreCabecera.textContent = perfil.nombre;
    document.dispatchEvent(new CustomEvent(EVENTO_PERFIL_CAMBIADO));
}

/**
 * Sube el perfil al servidor y apunta el código de amigo que devuelve.
 * @returns El código, o null si el servidor no está disponible.
 */
export async function subirPerfil(): Promise<string | null> {
    try {
        const publico = await sincronizarPerfil(perfil);
        cambiosSinSubir = false;
        if (publico.codigo !== perfil.codigo) {
            perfil.codigo = publico.codigo;
            guardarPerfil();
        }
        return publico.codigo;
    } catch (error) {
        if (!(error instanceof ErrorOnline)) {
            console.error(error);
        }
        return null;
    }
}

/** Pinta el código de amigo en el diálogo (o por qué no hay). */
function pintarCodigo(cargando = false): void {
    elementos.codigo.textContent = perfil.codigo ?? "······";
    elementos.mensajeCodigo.textContent = perfil.codigo
        ? texto("codigoExplicacion")
        : texto(cargando ? "conectando" : "onlineNoDisponible");
}

/** Marca como elegidos el avatar y el color actuales en las rejillas. */
function marcarSelecciones(): void {
    elementos.rejillaAvatares.querySelectorAll<HTMLButtonElement>("button").forEach((boton) => {
        boton.setAttribute("aria-checked", String(boton.dataset.avatar === perfil.avatar));
    });
    elementos.rejillaColores.querySelectorAll<HTMLButtonElement>("button").forEach((boton) => {
        boton.setAttribute("aria-checked", String(boton.dataset.color === perfil.color));
    });
}

/** Crea los botones de avatares y colores. */
function crearRejillas(): void {
    elementos.rejillaAvatares.replaceChildren(
        ...AVATARES.map((avatar) => {
            const boton = document.createElement("button");
            boton.type = "button";
            boton.className = "opcion-avatar";
            boton.setAttribute("role", "radio");
            boton.dataset.avatar = avatar;
            boton.textContent = avatar;
            boton.addEventListener("click", () => {
                perfil.avatar = avatar;
                cambiosSinSubir = true;
                guardarPerfil();
                marcarSelecciones();
            });
            return boton;
        }),
    );
    elementos.rejillaColores.replaceChildren(
        ...COLORES_AVATAR.map((color) => {
            const boton = document.createElement("button");
            boton.type = "button";
            boton.className = "opcion-color";
            boton.setAttribute("role", "radio");
            boton.setAttribute("aria-label", color);
            boton.dataset.color = color;
            boton.style.setProperty("--color-avatar", color);
            boton.addEventListener("click", () => {
                perfil.color = color;
                cambiosSinSubir = true;
                guardarPerfil();
                marcarSelecciones();
            });
            return boton;
        }),
    );
}

/** Abre el diálogo del perfil y consigue el código de amigo si aún no lo hay. */
export function abrirPerfil(): void {
    elementos.campoNombre.value = perfil.nombre;
    marcarSelecciones();
    pintarCodigo(true);
    elementos.dialogo.showModal();
    if (!perfil.codigo || cambiosSinSubir) {
        void subirPerfil().then(() => pintarCodigo());
    } else {
        pintarCodigo();
    }
}

/** Copia un texto al portapapeles (sin fallar si el navegador no deja). */
export async function copiarAlPortapapeles(contenido: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(contenido);
        return true;
    } catch {
        return false;
    }
}

/** Carga el perfil guardado y conecta el diálogo. */
export function iniciarPerfil(): void {
    const guardado = leerDatoGuardado<Partial<Perfil>>(CLAVE_PERFIL, {});
    perfil = { ...perfil, ...guardado };
    perfil.nombre = limpiarNombre(perfil.nombre) ?? crearPerfilNuevo().nombre;
    if (!AVATARES.includes(perfil.avatar as (typeof AVATARES)[number])) perfil.avatar = AVATARES[0];
    if (!COLORES_AVATAR.includes(perfil.color as (typeof COLORES_AVATAR)[number])) perfil.color = COLORES_AVATAR[0];

    elementos.campoNombre.maxLength = LONGITUD_MAXIMA_NOMBRE;
    crearRejillas();
    guardarPerfil();

    elementos.botonPerfil.addEventListener("click", abrirPerfil);
    elementos.campoNombre.addEventListener("input", () => {
        const nombre = limpiarNombre(elementos.campoNombre.value);
        if (nombre) {
            perfil.nombre = nombre;
            cambiosSinSubir = true;
            guardarPerfil();
        }
    });
    elementos.dialogo.addEventListener("click", (evento) => {
        if (evento.target === elementos.dialogo) {
            elementos.dialogo.close();
        }
    });
    elementos.dialogo.addEventListener("close", () => {
        elementos.campoNombre.value = perfil.nombre;
        if (cambiosSinSubir) {
            void subirPerfil();
        }
    });
    obtenerElemento("boton-copiar-codigo").addEventListener("click", async () => {
        if (perfil.codigo && (await copiarAlPortapapeles(perfil.codigo))) {
            elementos.mensajeCodigo.textContent = texto("codigoCopiado");
        }
    });
}

/**
 * interfaz-cuenta.ts
 * Interfaz de la cuenta:
 *   - Botón de la cabecera: "Entrar" como invitado; foto, usuario y puntos con sesión.
 *   - Diálogo de entrar / crear cuenta (usuario y contraseña).
 *   - Diálogo de perfil: subir o quitar foto, estadísticas, cambiar
 *     contraseña y cerrar sesión.
 */

import type { ClaveTexto } from "../i18n/textos";
import { EVENTO_IDIOMA_CAMBIADO, obtenerIdioma, texto } from "../i18n/textos";
import { formatearPuntos } from "../juego/puntuacion";
import { obtenerElemento } from "../utilidades/dom";
import {
    cambiarContrasena,
    cambiarNombre,
    entrar,
    ErrorCuenta,
    EVENTO_SESION,
    hayOnline,
    LONGITUD_MAXIMA_NOMBRE,
    nombreVisible,
    obtenerPerfil,
    quitarAvatar,
    registrarse,
    salir,
    subirAvatar,
    urlAvatar,
} from "./sesion";

/** Colores de fondo de los avatares sin foto (se elige uno según el usuario). */
const COLORES_INICIALES = ["#ff2e7e", "#19f5c8", "#ffd84d", "#22e5ff", "#a78bfa", "#ff8a3d", "#4ade80", "#f472b6"];

const elementos = {
    botonCuenta: obtenerElemento("boton-cuenta", HTMLButtonElement),
    avatarCabecera: obtenerElemento("avatar-cabecera"),
    usuarioCabecera: obtenerElemento("usuario-cabecera"),
    puntosCabecera: obtenerElemento("puntos-cabecera"),
    dialogoEntrar: obtenerElemento("dialogo-entrar", HTMLDialogElement),
    pestanasEntrar: [...document.querySelectorAll<HTMLButtonElement>(".pestana-cuenta")],
    formularioEntrar: obtenerElemento("formulario-entrar", HTMLFormElement),
    campoUsuario: obtenerElemento("campo-usuario", HTMLInputElement),
    campoContrasena: obtenerElemento("campo-contrasena", HTMLInputElement),
    grupoRepetir: obtenerElemento("grupo-repetir"),
    campoRepetir: obtenerElemento("campo-repetir", HTMLInputElement),
    botonEnviarEntrar: obtenerElemento("boton-enviar-entrar", HTMLButtonElement),
    mensajeEntrar: obtenerElemento("mensaje-entrar"),
    ayudaUsuario: obtenerElemento("ayuda-usuario"),
    dialogoPerfil: obtenerElemento("dialogo-perfil", HTMLDialogElement),
    avatarPerfil: obtenerElemento("avatar-perfil"),
    usuarioPerfil: obtenerElemento("usuario-perfil"),
    nombrePerfil: obtenerElemento("nombre-perfil"),
    formularioNombre: obtenerElemento("formulario-nombre", HTMLFormElement),
    campoNombre: obtenerElemento("campo-nombre", HTMLInputElement),
    mensajeNombre: obtenerElemento("mensaje-nombre"),
    campoFoto: obtenerElemento("campo-foto", HTMLInputElement),
    botonQuitarFoto: obtenerElemento("boton-quitar-foto", HTMLButtonElement),
    mensajeFoto: obtenerElemento("mensaje-foto"),
    statPuntos: obtenerElemento("stat-puntos"),
    statPartidas: obtenerElemento("stat-partidas"),
    statPrecision: obtenerElemento("stat-precision"),
    formularioContrasena: obtenerElemento("formulario-contrasena", HTMLFormElement),
    campoNuevaContrasena: obtenerElemento("campo-nueva-contrasena", HTMLInputElement),
    mensajeContrasena: obtenerElemento("mensaje-contrasena"),
    botonSalir: obtenerElemento("boton-salir", HTMLButtonElement),
};

/** "entrar" o "registro": qué hace el formulario del diálogo. */
let modoFormulario: "entrar" | "registro" = "entrar";
/** Acción pendiente tras entrar (por ejemplo, añadir un amigo de una invitación). */
let alEntrar: (() => void) | null = null;

/** Datos mínimos para pintar un avatar. */
export interface DatosAvatar {
    id: string;
    usuario: string;
    nombre?: string | null;
    avatarVersion: number | null;
}

/**
 * Pinta un avatar: la foto del jugador o, si no tiene, su inicial sobre un color.
 * @param elemento Elemento con la clase "avatar".
 * @param datos Jugador (null = invitado).
 */
export function pintarAvatar(elemento: HTMLElement, datos: DatosAvatar | null): void {
    const url = datos ? urlAvatar(datos.id, datos.avatarVersion) : null;
    elemento.replaceChildren();
    if (url) {
        const imagen = document.createElement("img");
        imagen.src = url;
        imagen.alt = "";
        imagen.loading = "lazy";
        imagen.decoding = "async";
        imagen.draggable = false;
        elemento.append(imagen);
        elemento.style.removeProperty("--color-avatar");
        return;
    }
    const nombre = datos ? nombreVisible(datos) : "?";
    let hash = 0;
    for (const caracter of nombre) hash = (hash * 31 + caracter.charCodeAt(0)) >>> 0;
    elemento.textContent = datos ? nombre[0].toUpperCase() : "?";
    elemento.style.setProperty("--color-avatar", COLORES_INICIALES[hash % COLORES_INICIALES.length]);
}

/**
 * Traduce un error de cuenta a un mensaje para el jugador.
 * @param error Error recibido.
 */
export function mensajeDeErrorCuenta(error: unknown): string {
    const claves: Record<string, ClaveTexto> = {
        credenciales: "errorCredenciales",
        "usuario-ocupado": "errorUsuarioOcupado",
        "usuario-no-valido": "errorUsuarioNoValido",
        "contrasena-corta": "errorContrasenaCorta",
        "confirmacion-activada": "errorConfirmacion",
        "demasiados-intentos": "errorDemasiadosIntentos",
        "sin-conexion": "errorOnline",
        "sin-servidor": "onlineNoDisponible",
        "imagen-no-valida": "errorImagen",
        "imagen-grande": "errorImagenGrande",
        "usuario-no-existe": "errorUsuarioNoExiste",
        "eres-tu": "errorEresTu",
        "demasiados-amigos": "demasiadosAmigos",
        "demasiado-rapido": "errorDemasiadoRapido",
        "nombre-no-valido": "errorNombre",
    };
    const clave = error instanceof ErrorCuenta ? claves[error.codigo] : undefined;
    if (!clave) console.error(error);
    return texto(clave ?? "errorOnline");
}

/** Repinta el botón de la cabecera según haya sesión o no. */
function pintarCabecera(): void {
    const perfil = obtenerPerfil();
    elementos.botonCuenta.hidden = !hayOnline();
    elementos.botonCuenta.classList.toggle("con-sesion", perfil !== null);
    pintarAvatar(elementos.avatarCabecera, perfil);
    elementos.usuarioCabecera.textContent = perfil ? nombreVisible(perfil) : texto("entrar");
    elementos.puntosCabecera.textContent = perfil ? `${formatearPuntos(perfil.puntosTotales, obtenerIdioma())} pts` : "";
    elementos.puntosCabecera.hidden = !perfil;
    elementos.botonCuenta.setAttribute("aria-label", perfil ? `${texto("tuPerfil")}: ${perfil.usuario}` : texto("entrar"));
}

/** Repinta el diálogo de perfil. */
function pintarPerfil(): void {
    const perfil = obtenerPerfil();
    if (!perfil) return;
    pintarAvatar(elementos.avatarPerfil, perfil);
    elementos.nombrePerfil.textContent = nombreVisible(perfil);
    elementos.usuarioPerfil.textContent = perfil.usuario;
    elementos.botonQuitarFoto.hidden = perfil.avatarVersion === null;
    const idioma = obtenerIdioma();
    elementos.statPuntos.textContent = formatearPuntos(perfil.puntosTotales, idioma);
    elementos.statPartidas.textContent = formatearPuntos(perfil.partidas, idioma);
    elementos.statPrecision.textContent =
        perfil.preguntas > 0 ? `${Math.round((perfil.aciertos / perfil.preguntas) * 100)}%` : "–";
}

/**
 * Cambia el formulario entre "entrar" y "crear cuenta".
 * @param modo Modo del formulario.
 */
function cambiarModoFormulario(modo: "entrar" | "registro"): void {
    modoFormulario = modo;
    elementos.pestanasEntrar.forEach((pestana) => {
        pestana.setAttribute("aria-selected", String(pestana.dataset.modo === modo));
    });
    elementos.grupoRepetir.hidden = modo === "entrar";
    elementos.campoRepetir.required = modo === "registro";
    elementos.ayudaUsuario.hidden = modo === "entrar";
    elementos.campoContrasena.autocomplete = modo === "entrar" ? "current-password" : "new-password";
    elementos.botonEnviarEntrar.textContent = texto(modo === "entrar" ? "entrar" : "crearCuenta");
    elementos.mensajeEntrar.textContent = "";
}

/**
 * Abre el diálogo de entrar.
 * @param modo "entrar" o "registro".
 * @param despues Acción a hacer cuando el jugador haya entrado.
 */
export function abrirEntrar(modo: "entrar" | "registro" = "entrar", despues: (() => void) | null = null): void {
    if (!hayOnline()) return;
    alEntrar = despues;
    cambiarModoFormulario(modo);
    elementos.formularioEntrar.reset();
    elementos.dialogoEntrar.showModal();
    elementos.campoUsuario.focus();
}

/** Envía el formulario de entrar o crear cuenta. */
async function enviarFormularioEntrar(): Promise<void> {
    const usuario = elementos.campoUsuario.value;
    const contrasena = elementos.campoContrasena.value;
    if (modoFormulario === "registro" && contrasena !== elementos.campoRepetir.value) {
        elementos.mensajeEntrar.textContent = texto("errorContrasenasDistintas");
        return;
    }
    elementos.botonEnviarEntrar.disabled = true;
    elementos.mensajeEntrar.textContent = texto("conectando");
    try {
        if (modoFormulario === "entrar") {
            await entrar(usuario, contrasena);
        } else {
            await registrarse(usuario, contrasena);
        }
        elementos.dialogoEntrar.close();
        const pendiente = alEntrar;
        alEntrar = null;
        pendiente?.();
    } catch (error) {
        elementos.mensajeEntrar.textContent = mensajeDeErrorCuenta(error);
    } finally {
        elementos.botonEnviarEntrar.disabled = false;
    }
}

/** Cierra un diálogo al pulsar en el fondo oscuro. */
function cerrarAlPulsarFondo(dialogo: HTMLDialogElement): void {
    dialogo.addEventListener("click", (evento) => {
        if (evento.target === dialogo) dialogo.close();
    });
}

/** Conecta el botón de la cabecera y los dos diálogos. */
export function iniciarInterfazCuenta(): void {
    elementos.botonCuenta.addEventListener("click", () => {
        if (obtenerPerfil()) {
            pintarPerfil();
            elementos.mensajeFoto.textContent = "";
            elementos.mensajeContrasena.textContent = "";
            elementos.mensajeNombre.textContent = "";
            elementos.campoNombre.value = obtenerPerfil()?.nombre ?? "";
            elementos.campoNombre.placeholder = obtenerPerfil()?.usuario ?? "";
            elementos.dialogoPerfil.showModal();
        } else {
            abrirEntrar();
        }
    });
    document.querySelectorAll<HTMLElement>("[data-abrir-entrar]").forEach((boton) => {
        boton.addEventListener("click", () => abrirEntrar(boton.dataset.abrirEntrar === "registro" ? "registro" : "entrar"));
    });

    elementos.pestanasEntrar.forEach((pestana) => {
        pestana.addEventListener("click", () => cambiarModoFormulario(pestana.dataset.modo === "registro" ? "registro" : "entrar"));
    });
    elementos.formularioEntrar.addEventListener("submit", (evento) => {
        evento.preventDefault();
        void enviarFormularioEntrar();
    });
    // El usuario se escribe siempre en minúsculas y sin espacios.
    elementos.campoUsuario.addEventListener("input", () => {
        const limpio = elementos.campoUsuario.value.toLowerCase().replace(/\s/g, "");
        if (limpio !== elementos.campoUsuario.value) elementos.campoUsuario.value = limpio;
    });

    elementos.campoFoto.addEventListener("change", async () => {
        const archivo = elementos.campoFoto.files?.[0];
        elementos.campoFoto.value = "";
        if (!archivo) return;
        elementos.mensajeFoto.textContent = texto("subiendoFoto");
        try {
            await subirAvatar(archivo);
            elementos.mensajeFoto.textContent = texto("fotoActualizada");
        } catch (error) {
            elementos.mensajeFoto.textContent = mensajeDeErrorCuenta(error);
        }
    });
    elementos.botonQuitarFoto.addEventListener("click", async () => {
        try {
            await quitarAvatar();
            elementos.mensajeFoto.textContent = "";
        } catch (error) {
            elementos.mensajeFoto.textContent = mensajeDeErrorCuenta(error);
        }
    });
    elementos.campoNombre.maxLength = LONGITUD_MAXIMA_NOMBRE;
    elementos.formularioNombre.addEventListener("submit", async (evento) => {
        evento.preventDefault();
        elementos.mensajeNombre.textContent = texto("guardando");
        try {
            await cambiarNombre(elementos.campoNombre.value);
            elementos.mensajeNombre.textContent = texto("nombreGuardado");
        } catch (error) {
            elementos.mensajeNombre.textContent = mensajeDeErrorCuenta(error);
        }
    });
    elementos.formularioContrasena.addEventListener("submit", async (evento) => {
        evento.preventDefault();
        try {
            await cambiarContrasena(elementos.campoNuevaContrasena.value);
            elementos.campoNuevaContrasena.value = "";
            elementos.mensajeContrasena.textContent = texto("contrasenaCambiada");
        } catch (error) {
            elementos.mensajeContrasena.textContent = mensajeDeErrorCuenta(error);
        }
    });
    elementos.botonSalir.addEventListener("click", async () => {
        await salir().catch(() => {});
        elementos.dialogoPerfil.close();
    });

    cerrarAlPulsarFondo(elementos.dialogoEntrar);
    cerrarAlPulsarFondo(elementos.dialogoPerfil);

    document.addEventListener(EVENTO_SESION, () => {
        pintarCabecera();
        pintarPerfil();
    });
    document.addEventListener(EVENTO_IDIOMA_CAMBIADO, () => {
        pintarCabecera();
        cambiarModoFormulario(modoFormulario);
    });
    pintarCabecera();
}

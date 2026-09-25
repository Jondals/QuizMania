/**
 * interfaz-cuenta.ts
 * Interfaz de la cuenta:
 *   - Botón de la cabecera que abre un menú desplegable. Como invitado,
 *     el menú tiene las pestañas Entrar / Crear cuenta (usuario y
 *     contraseña). Con sesión, enseña tu foto, nombre, puntos, código de
 *     amigo y las opciones Editar perfil, Ranking y amigos y Cerrar sesión.
 *   - Diálogo "Editar perfil": nombre, foto, cambiar la contraseña (pide la
 *     actual) y borrar la cuenta.
 *   - Botones de ojo para ver la contraseña y botones de copiar el código.
 */

import type { ClaveTexto } from "../i18n/textos";
import { EVENTO_IDIOMA_CAMBIADO, obtenerIdioma, texto } from "../i18n/textos";
import { formatearPuntos } from "../juego/puntuacion";
import { confirmar } from "../utilidades/confirmar";
import { obtenerElemento } from "../utilidades/dom";
import { copiarAlPortapapeles } from "../utilidades/portapapeles";
import {
    borrarCuenta,
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

const ICONO_OJO =
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
const ICONO_OJO_TACHADO =
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M3 3l18 18M10.6 5.1A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a18 18 0 0 1-3.1 4M6.6 6.6A17.6 17.6 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

const elementos = {
    zonaCuenta: obtenerElemento("zona-cuenta"),
    botonCuenta: obtenerElemento("boton-cuenta", HTMLButtonElement),
    avatarCabecera: obtenerElemento("avatar-cabecera"),
    usuarioCabecera: obtenerElemento("usuario-cabecera"),
    puntosCabecera: obtenerElemento("puntos-cabecera"),
    menu: obtenerElemento("menu-cuenta"),
    menuInvitado: obtenerElemento("menu-invitado"),
    menuJugador: obtenerElemento("menu-jugador"),
    pestanasEntrar: [...document.querySelectorAll<HTMLButtonElement>(".pestana-cuenta")],
    formularioEntrar: obtenerElemento("formulario-entrar", HTMLFormElement),
    campoUsuario: obtenerElemento("campo-usuario", HTMLInputElement),
    campoContrasena: obtenerElemento("campo-contrasena", HTMLInputElement),
    grupoRepetir: obtenerElemento("grupo-repetir"),
    campoRepetir: obtenerElemento("campo-repetir", HTMLInputElement),
    botonEnviarEntrar: obtenerElemento("boton-enviar-entrar", HTMLButtonElement),
    mensajeEntrar: obtenerElemento("mensaje-entrar"),
    ayudaUsuario: obtenerElemento("ayuda-usuario"),
    avatarMenu: obtenerElemento("avatar-menu"),
    nombreMenu: obtenerElemento("nombre-menu"),
    puntosMenu: obtenerElemento("puntos-menu"),
    codigoMenu: obtenerElemento("codigo-menu"),
    statPartidas: obtenerElemento("stat-partidas"),
    statPrecision: obtenerElemento("stat-precision"),
    botonEditarPerfil: obtenerElemento("boton-editar-perfil", HTMLButtonElement),
    botonMenuRanking: obtenerElemento("boton-menu-ranking", HTMLButtonElement),
    botonSalir: obtenerElemento("boton-salir", HTMLButtonElement),
    dialogoPerfil: obtenerElemento("dialogo-perfil", HTMLDialogElement),
    formularioPerfil: obtenerElemento("formulario-perfil", HTMLFormElement),
    campoNombre: obtenerElemento("campo-nombre", HTMLInputElement),
    avatarPerfil: obtenerElemento("avatar-perfil"),
    campoFoto: obtenerElemento("campo-foto", HTMLInputElement),
    botonQuitarFoto: obtenerElemento("boton-quitar-foto", HTMLButtonElement),
    mensajeFoto: obtenerElemento("mensaje-foto"),
    usuarioOculto: obtenerElemento("usuario-oculto", HTMLInputElement),
    campoContrasenaActual: obtenerElemento("campo-contrasena-actual", HTMLInputElement),
    campoNuevaContrasena: obtenerElemento("campo-nueva-contrasena", HTMLInputElement),
    mensajePerfil: obtenerElemento("mensaje-perfil"),
    botonGuardarPerfil: obtenerElemento("boton-guardar-perfil", HTMLButtonElement),
    botonCancelarPerfil: obtenerElemento("boton-cancelar-perfil", HTMLButtonElement),
    botonBorrarCuenta: obtenerElemento("boton-borrar-cuenta", HTMLButtonElement),
};

/** "entrar" o "registro": qué hace el formulario del menú. */
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
    for (const caracter of datos?.usuario ?? "?") hash = (hash * 31 + caracter.charCodeAt(0)) >>> 0;
    elemento.textContent = datos ? [...nombre][0] : "?";
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
        "contrasena-actual": "errorContrasenaActual",
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

/* ---------- Menú desplegable ---------- */

/** Indica si el menú de la cuenta está abierto. */
function menuAbierto(): boolean {
    return elementos.menu.classList.contains("abierto");
}

/**
 * Abre o cierra el menú de la cuenta.
 * @param abrir true para abrir, false para cerrar.
 */
function alternarMenu(abrir: boolean): void {
    elementos.menu.classList.toggle("abierto", abrir);
    elementos.botonCuenta.setAttribute("aria-expanded", String(abrir));
    if (abrir && !obtenerPerfil()) {
        // Se espera a que empiece la animación para no mover el foco a algo invisible.
        requestAnimationFrame(() => elementos.campoUsuario.focus());
    }
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
    elementos.menuInvitado.dataset.modo = modo;
    elementos.grupoRepetir.hidden = modo === "entrar";
    elementos.campoRepetir.required = modo === "registro";
    elementos.ayudaUsuario.hidden = modo === "entrar";
    elementos.campoContrasena.autocomplete = modo === "entrar" ? "current-password" : "new-password";
    elementos.botonEnviarEntrar.textContent = texto(modo === "entrar" ? "entrar" : "crearCuenta");
    elementos.mensajeEntrar.textContent = "";
}

/**
 * Abre el menú de la cuenta en "Entrar" o "Crear cuenta".
 * @param modo "entrar" o "registro".
 * @param despues Acción a hacer cuando el jugador haya entrado.
 */
export function abrirEntrar(modo: "entrar" | "registro" = "entrar", despues: (() => void) | null = null): void {
    if (!hayOnline()) return;
    alEntrar = despues;
    cambiarModoFormulario(modo);
    window.scrollTo({ top: 0, behavior: "smooth" });
    alternarMenu(true);
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
    elementos.botonEnviarEntrar.classList.add("cargando");
    elementos.mensajeEntrar.textContent = "";
    try {
        if (modoFormulario === "entrar") {
            await entrar(usuario, contrasena);
        } else {
            await registrarse(usuario, contrasena);
        }
        elementos.formularioEntrar.reset();
        alternarMenu(false);
        const pendiente = alEntrar;
        alEntrar = null;
        pendiente?.();
    } catch (error) {
        elementos.mensajeEntrar.textContent = mensajeDeErrorCuenta(error);
        elementos.menu.classList.remove("sacudir");
        void elementos.menu.offsetWidth;
        elementos.menu.classList.add("sacudir");
    } finally {
        elementos.botonEnviarEntrar.disabled = false;
        elementos.botonEnviarEntrar.classList.remove("cargando");
    }
}

/* ---------- Pintar ---------- */

/** Repinta el botón de la cabecera y el contenido del menú. */
function pintarCuenta(): void {
    const perfil = obtenerPerfil();
    const idioma = obtenerIdioma();
    elementos.zonaCuenta.hidden = !hayOnline();
    elementos.botonCuenta.classList.toggle("con-sesion", perfil !== null);
    pintarAvatar(elementos.avatarCabecera, perfil);
    elementos.usuarioCabecera.textContent = perfil ? nombreVisible(perfil) : texto("entrar");
    elementos.puntosCabecera.textContent = perfil ? `${formatearPuntos(perfil.puntosTotales, idioma)} pts` : "";
    elementos.puntosCabecera.hidden = !perfil;
    elementos.botonCuenta.setAttribute("aria-label", perfil ? `${texto("tuCuenta")}: ${nombreVisible(perfil)}` : texto("entrar"));

    elementos.menuInvitado.hidden = perfil !== null;
    elementos.menuJugador.hidden = perfil === null;
    if (!perfil) return;
    pintarAvatar(elementos.avatarMenu, perfil);
    elementos.nombreMenu.textContent = nombreVisible(perfil);
    elementos.puntosMenu.textContent = `${formatearPuntos(perfil.puntosTotales, idioma)} ${texto("puntos")}`;
    elementos.codigoMenu.textContent = perfil.codigo ?? "—";
    elementos.statPartidas.textContent = formatearPuntos(perfil.partidas, idioma);
    elementos.statPrecision.textContent = perfil.preguntas > 0 ? `${Math.round((perfil.aciertos / perfil.preguntas) * 100)}%` : "–";
    pintarAvatar(elementos.avatarPerfil, perfil);
    elementos.botonQuitarFoto.hidden = perfil.avatarVersion === null;
}

/* ---------- Editar perfil ---------- */

/** Abre el diálogo de editar perfil con los datos actuales. */
function abrirEditarPerfil(): void {
    const perfil = obtenerPerfil();
    if (!perfil) return;
    alternarMenu(false);
    elementos.campoNombre.value = nombreVisible(perfil);
    elementos.usuarioOculto.value = perfil.usuario;
    elementos.campoContrasenaActual.value = "";
    elementos.campoNuevaContrasena.value = "";
    elementos.mensajePerfil.textContent = "";
    elementos.mensajePerfil.classList.remove("es-error");
    elementos.mensajeFoto.textContent = "";
    pintarCuenta();
    elementos.dialogoPerfil.showModal();
}

/** Guarda el nombre y, si se ha escrito, la contraseña nueva. */
async function guardarPerfil(): Promise<void> {
    const perfil = obtenerPerfil();
    if (!perfil) return;
    const mensaje = elementos.mensajePerfil;
    mensaje.classList.remove("es-error");
    const nombre = elementos.campoNombre.value.trim();
    const actual = elementos.campoContrasenaActual.value;
    const nueva = elementos.campoNuevaContrasena.value;
    if (nueva && !actual) {
        mensaje.textContent = texto("errorFaltaContrasenaActual");
        mensaje.classList.add("es-error");
        elementos.campoContrasenaActual.focus();
        return;
    }
    elementos.botonGuardarPerfil.disabled = true;
    elementos.botonGuardarPerfil.classList.add("cargando");
    try {
        if (nombre !== nombreVisible(perfil)) {
            // Si deja su propio usuario (o nada), se vuelve a usar el usuario.
            await cambiarNombre(nombre.toLowerCase() === perfil.usuario ? "" : nombre);
        }
        if (nueva) {
            await cambiarContrasena(actual, nueva);
        }
        mensaje.textContent = texto("cambiosGuardados");
        setTimeout(() => elementos.dialogoPerfil.close(), 700);
    } catch (error) {
        mensaje.textContent = mensajeDeErrorCuenta(error);
        mensaje.classList.add("es-error");
    } finally {
        elementos.botonGuardarPerfil.disabled = false;
        elementos.botonGuardarPerfil.classList.remove("cargando");
    }
}

/* ---------- Detalles compartidos ---------- */

/** Pone los botones de ojo para ver u ocultar las contraseñas. */
function conectarBotonesDeOjo(): void {
    document.querySelectorAll<HTMLButtonElement>(".ver-clave").forEach((boton) => {
        const campo = boton.parentElement?.querySelector("input");
        if (!campo) return;
        boton.innerHTML = ICONO_OJO;
        boton.addEventListener("click", () => {
            const visible = campo.type === "password";
            campo.type = visible ? "text" : "password";
            boton.innerHTML = visible ? ICONO_OJO_TACHADO : ICONO_OJO;
            boton.setAttribute("aria-label", texto(visible ? "ocultarContrasena" : "mostrarContrasena"));
            boton.setAttribute("aria-pressed", String(visible));
        });
    });
}

/** Botones que copian un texto de la página (data-copiar = id del elemento). */
function conectarBotonesDeCopiar(): void {
    document.querySelectorAll<HTMLButtonElement>("[data-copiar]").forEach((boton) => {
        boton.addEventListener("click", async () => {
            const origen = document.getElementById(boton.dataset.copiar ?? "");
            const contenido = origen?.textContent?.trim();
            if (!contenido || contenido === "—" || !(await copiarAlPortapapeles(contenido))) return;
            boton.classList.add("copiado");
            setTimeout(() => boton.classList.remove("copiado"), 1200);
        });
    });
}

/**
 * Conecta el menú de la cuenta y el diálogo de editar perfil.
 * @param abrirRanking Muestra la pantalla de ranking (lo decide main.ts).
 */
export function iniciarInterfazCuenta(abrirRanking: () => void): void {
    elementos.botonCuenta.addEventListener("click", () => alternarMenu(!menuAbierto()));
    // Se cierra al pulsar fuera o con Escape.
    document.addEventListener("pointerdown", (evento) => {
        if (menuAbierto() && !elementos.zonaCuenta.contains(evento.target as Node)) alternarMenu(false);
    });
    document.addEventListener("keydown", (evento) => {
        if (evento.key === "Escape" && menuAbierto()) {
            alternarMenu(false);
            elementos.botonCuenta.focus();
        }
    });
    document.querySelectorAll<HTMLElement>("[data-abrir-entrar]").forEach((boton) => {
        boton.addEventListener("click", (evento) => {
            evento.stopPropagation();
            abrirEntrar(boton.dataset.abrirEntrar === "registro" ? "registro" : "entrar");
        });
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

    elementos.botonEditarPerfil.addEventListener("click", abrirEditarPerfil);
    elementos.botonMenuRanking.addEventListener("click", () => {
        alternarMenu(false);
        abrirRanking();
    });
    elementos.botonSalir.addEventListener("click", async () => {
        alternarMenu(false);
        await salir().catch(() => {});
    });

    elementos.campoNombre.maxLength = LONGITUD_MAXIMA_NOMBRE;
    elementos.formularioPerfil.addEventListener("submit", (evento) => {
        evento.preventDefault();
        void guardarPerfil();
    });
    elementos.botonCancelarPerfil.addEventListener("click", () => elementos.dialogoPerfil.close());
    elementos.dialogoPerfil.addEventListener("click", (evento) => {
        if (evento.target === elementos.dialogoPerfil) elementos.dialogoPerfil.close();
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
    elementos.botonBorrarCuenta.addEventListener("click", async () => {
        const perfil = obtenerPerfil();
        if (!perfil) return;
        elementos.dialogoPerfil.close();
        const acepta = await confirmar({
            titulo: texto("tituloBorrarCuenta"),
            mensaje: `${texto("confirmarBorrarCuenta")} (${nombreVisible(perfil)})`,
            aceptar: texto("borrarCuenta"),
            peligroso: true,
        });
        if (!acepta) {
            elementos.dialogoPerfil.showModal();
            return;
        }
        try {
            await borrarCuenta();
        } catch (error) {
            elementos.dialogoPerfil.showModal();
            elementos.mensajePerfil.textContent = mensajeDeErrorCuenta(error);
            elementos.mensajePerfil.classList.add("es-error");
        }
    });

    conectarBotonesDeOjo();
    conectarBotonesDeCopiar();
    document.addEventListener(EVENTO_SESION, pintarCuenta);
    document.addEventListener(EVENTO_IDIOMA_CAMBIADO, () => {
        pintarCuenta();
        cambiarModoFormulario(modoFormulario);
    });
    cambiarModoFormulario("entrar");
    pintarCuenta();
}

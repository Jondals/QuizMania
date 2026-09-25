/**
 * textos.ts
 * Todos los textos de la interfaz en español e inglés, el idioma actual y
 * la función que traduce el HTML. Los elementos del HTML indican qué texto
 * llevan con atributos:
 *   data-texto="clave"              → textContent
 *   data-texto-aria="clave"         → aria-label
 *   data-texto-placeholder="clave"  → placeholder
 */

/** Idiomas disponibles. */
export type Idioma = "es" | "en";

/** Diccionario de textos por idioma. */
const TEXTOS = {
    es: {
        descripcion: "Juego de trivia: tira de la palanca de la tragaperras y responde preguntas del tema que salga.",
        titular1a: "Gira los",
        titular1b: "rodillos",
        titular2a: "Descubre tu",
        titular2b: "reto",
        titular3a: "Aprende y",
        titular3b: "diviértete",
        portadaTexto: "Elige un modo, tira de la palanca y responde. Crea tu cuenta para sumar puntos, añadir amigos y subir en el ranking.",
        datoTemas: "Temas",
        datoModos: "Modos",
        inicio: "QuizMania, ir al inicio",
        ajustes: "Ajustes",
        cerrar: "Cerrar",
        idioma: "Idioma",
        tiraDeLaPalanca: "¡Tira de la palanca!",
        palanca: "Tirar de la palanca",
        pistaPalanca: "Arrastra la palanca hacia abajo, púlsala o dale a Espacio",
        aceptar: "Aceptar",
        cancelar: "Cancelar",
        abandonar: "Abandonar",
        tituloTerminar: "¿Terminar la partida?",
        tituloAbandonar: "¿Abandonar la partida?",
        girando: "Girando…",
        temaElegido: "Tema",
        modoDeJuego: "Modo de juego",
        tuRecord: "Tu récord",
        cargandoPreguntas: "Cargando preguntas…",
        traduciendo: "Traduciendo preguntas…",
        errorCarga: "No se han podido cargar las preguntas. Comprueba tu conexión.",
        volverATirar: "Volver a tirar",
        pregunta: "Pregunta",
        de: "de",
        respuestas: "Respuestas",
        pts: "pts",
        puntos: "puntos",
        racha: "Racha de aciertos",
        vidas: "Vidas",
        terminar: "Terminar partida",
        confirmarTerminar: "Se guardarán los puntos que llevas conseguidos.",
        confirmarAbandonar: "Tienes una partida en juego. Si sales ahora, no se guardarán los puntos.",
        preguntasLocales: "Sin conexión: usando preguntas guardadas.",
        anterior: "Anterior",
        siguiente: "Siguiente",
        verResultados: "Ver resultados",
        revisar: "Revisar respuestas",
        jugarDeNuevo: "Jugar de nuevo",
        verRanking: "Ver ranking",
        aciertos: "Aciertos",
        precision: "Precisión",
        mejorRacha: "Mejor racha",
        record: "Récord",
        mensajeRecord: "¡Nuevo récord!",
        mensajePerfecto: "¡Perfecto! Eres un genio.",
        mensajeBueno: "¡Muy bien!",
        mensajeRegular: "No está mal, ¡sigue practicando!",
        mensajeMalo: "¡A la próxima irá mejor!",
        mensajeSinVidas: "¡Te has quedado sin vidas!",
        nuevoRecord: "🏆 Has batido tu récord personal",
        guardando: "Guardando partida…",
        puntosSumados: "puntos sumados",
        total: "Total",
        avisoInvitado: "Juegas como invitado: crea una cuenta para sumar estos puntos y salir en el ranking.",
        crearCuenta: "Crear cuenta",
        entreTusAmigos: "Entre tus amigos",
        invitarTexto: "Añade amigos para picarte con ellos",
        invitar: "Invitar amigos",
        volumenEfectos: "Volumen de los efectos",
        entrar: "Entrar",
        usuario: "Usuario",
        contrasena: "Contraseña",
        repetirContrasena: "Repite la contraseña",
        ayudaUsuario: "3-20 caracteres: letras minúsculas, números o _. Sin correo: solo usuario y contraseña.",
        tuPerfil: "Tu perfil",
        nombreVisible: "Nombre visible",
        guardar: "Guardar",
        nombreGuardado: "¡Nombre guardado!",
        errorNombre: "El nombre puede tener como mucho 24 caracteres.",
        cambiarFoto: "Cambiar foto",
        quitarFoto: "Quitar foto",
        subiendoFoto: "Subiendo foto…",
        fotoActualizada: "¡Foto actualizada!",
        puntosTotales: "Puntos totales",
        partidas: "Partidas",
        nuevaContrasena: "Nueva contraseña",
        cambiarContrasena: "Cambiar contraseña",
        contrasenaCambiada: "Contraseña cambiada.",
        cerrarSesion: "Cerrar sesión",
        conectando: "Conectando…",
        cargando: "Cargando…",
        rankingYAmigos: "Ranking y amigos",
        volver: "Volver",
        clasificacion: "Clasificación",
        amigos: "Amigos",
        global: "Global",
        tuPosicion: "Tu posición",
        tu: "tú",
        sinJugar: "sin jugar",
        rankingVacio: "Nadie ha jugado aquí todavía. ¡Sé el primero!",
        sinAmigosTodavia: "Aún no tienes amigos. Añade a alguien por su usuario.",
        entraParaAmigos: "Entra en tu cuenta para ver el ranking de tus amigos.",
        entraParaAmigosLargo: "Crea una cuenta o entra para añadir amigos y picarte con ellos.",
        tuUsuario: "Tu usuario",
        compartir: "Compartir invitación",
        textoInvitacion: "¡Pícate conmigo en QuizMania!",
        enlaceCopiado: "¡Enlace de invitación copiado!",
        usuarioAmigo: "Usuario de tu amigo",
        anadir: "Añadir",
        amigoAnadido: "Amigo añadido",
        quitarAmigo: "Quitar amigo",
        confirmarQuitarAmigo: "¿Quitar de tus amigos a",
        demasiadosAmigos: "Has llegado al máximo de amigos.",
        onlineNoDisponible: "Las cuentas no están disponibles ahora mismo.",
        errorOnline: "No se ha podido conectar. Inténtalo de nuevo.",
        errorCredenciales: "Usuario o contraseña incorrectos.",
        errorUsuarioOcupado: "Ese usuario ya existe. Elige otro.",
        errorUsuarioNoValido: "El usuario debe tener 3-20 caracteres: letras minúsculas, números o _.",
        errorContrasenaCorta: "La contraseña debe tener al menos 6 caracteres.",
        errorContrasenasDistintas: "Las contraseñas no coinciden.",
        errorConfirmacion: "El servidor pide confirmar el correo: desactiva «Confirm email» en Supabase.",
        errorDemasiadosIntentos: "Demasiados intentos. Espera un poco.",
        errorImagen: "Esa imagen no se puede usar.",
        errorImagenGrande: "La imagen es demasiado grande (máx. 15 MB).",
        errorUsuarioNoExiste: "No hay ningún jugador con ese usuario.",
        errorEresTu: "¡Ese eres tú!",
        errorDemasiadoRapido: "Espera unos segundos entre partidas.",
    },
    en: {
        descripcion: "Trivia game: pull the slot machine lever and answer questions about the topic you get.",
        titular1a: "Spin the",
        titular1b: "reels",
        titular2a: "Find your",
        titular2b: "challenge",
        titular3a: "Learn and",
        titular3b: "have fun",
        portadaTexto: "Pick a mode, pull the lever and answer. Create an account to earn points, add friends and climb the ranking.",
        datoTemas: "Topics",
        datoModos: "Modes",
        inicio: "QuizMania, go home",
        ajustes: "Settings",
        cerrar: "Close",
        idioma: "Language",
        tiraDeLaPalanca: "Pull the lever!",
        palanca: "Pull the lever",
        pistaPalanca: "Drag the lever down, tap it or press Space",
        aceptar: "OK",
        cancelar: "Cancel",
        abandonar: "Leave",
        tituloTerminar: "End the game?",
        tituloAbandonar: "Leave the game?",
        girando: "Spinning…",
        temaElegido: "Topic",
        modoDeJuego: "Game mode",
        tuRecord: "Your best",
        cargandoPreguntas: "Loading questions…",
        traduciendo: "Translating questions…",
        errorCarga: "Questions could not be loaded. Check your connection.",
        volverATirar: "Pull again",
        pregunta: "Question",
        de: "of",
        respuestas: "Answers",
        pts: "pts",
        puntos: "points",
        racha: "Answer streak",
        vidas: "Lives",
        terminar: "End game",
        confirmarTerminar: "The points you have so far will be saved.",
        confirmarAbandonar: "You have a game in progress. If you leave now, your points won't be saved.",
        preguntasLocales: "Offline: using saved questions.",
        anterior: "Previous",
        siguiente: "Next",
        verResultados: "See results",
        revisar: "Review answers",
        jugarDeNuevo: "Play again",
        verRanking: "See ranking",
        aciertos: "Correct",
        precision: "Accuracy",
        mejorRacha: "Best streak",
        record: "Best",
        mensajeRecord: "New record!",
        mensajePerfecto: "Perfect! You're a genius.",
        mensajeBueno: "Well done!",
        mensajeRegular: "Not bad, keep practising!",
        mensajeMalo: "Better luck next time!",
        mensajeSinVidas: "You're out of lives!",
        nuevoRecord: "🏆 You beat your personal best",
        guardando: "Saving game…",
        puntosSumados: "points added",
        total: "Total",
        avisoInvitado: "You're playing as a guest: create an account to keep these points and appear in the ranking.",
        crearCuenta: "Create account",
        entreTusAmigos: "Among your friends",
        invitarTexto: "Add friends to compete with them",
        invitar: "Invite friends",
        volumenEfectos: "Sound effects volume",
        entrar: "Log in",
        usuario: "Username",
        contrasena: "Password",
        repetirContrasena: "Repeat password",
        ayudaUsuario: "3-20 characters: lowercase letters, numbers or _. No email: just username and password.",
        tuPerfil: "Your profile",
        nombreVisible: "Display name",
        guardar: "Save",
        nombreGuardado: "Name saved!",
        errorNombre: "The name can be at most 24 characters long.",
        cambiarFoto: "Change photo",
        quitarFoto: "Remove photo",
        subiendoFoto: "Uploading photo…",
        fotoActualizada: "Photo updated!",
        puntosTotales: "Total points",
        partidas: "Games",
        nuevaContrasena: "New password",
        cambiarContrasena: "Change password",
        contrasenaCambiada: "Password changed.",
        cerrarSesion: "Log out",
        conectando: "Connecting…",
        cargando: "Loading…",
        rankingYAmigos: "Ranking & friends",
        volver: "Back",
        clasificacion: "Leaderboard",
        amigos: "Friends",
        global: "Global",
        tuPosicion: "Your position",
        tu: "you",
        sinJugar: "not played",
        rankingVacio: "Nobody has played here yet. Be the first!",
        sinAmigosTodavia: "You have no friends yet. Add someone by username.",
        entraParaAmigos: "Log in to see your friends' ranking.",
        entraParaAmigosLargo: "Create an account or log in to add friends and compete with them.",
        tuUsuario: "Your username",
        compartir: "Share invite",
        textoInvitacion: "Challenge me on QuizMania!",
        enlaceCopiado: "Invite link copied!",
        usuarioAmigo: "Your friend's username",
        anadir: "Add",
        amigoAnadido: "Friend added",
        quitarAmigo: "Remove friend",
        confirmarQuitarAmigo: "Remove from your friends:",
        demasiadosAmigos: "You've reached the friend limit.",
        onlineNoDisponible: "Accounts aren't available right now.",
        errorOnline: "Couldn't connect. Please try again.",
        errorCredenciales: "Wrong username or password.",
        errorUsuarioOcupado: "That username is taken. Pick another one.",
        errorUsuarioNoValido: "Usernames have 3-20 characters: lowercase letters, numbers or _.",
        errorContrasenaCorta: "The password needs at least 6 characters.",
        errorContrasenasDistintas: "Passwords don't match.",
        errorConfirmacion: "The server requires email confirmation: turn off “Confirm email” in Supabase.",
        errorDemasiadosIntentos: "Too many attempts. Wait a moment.",
        errorImagen: "That image can't be used.",
        errorImagenGrande: "The image is too big (max. 15 MB).",
        errorUsuarioNoExiste: "There's no player with that username.",
        errorEresTu: "That's you!",
        errorDemasiadoRapido: "Wait a few seconds between games.",
    },
} as const;

/** Claves de texto disponibles. */
export type ClaveTexto = keyof (typeof TEXTOS)["es"];

/** Evento que se lanza en document al cambiar de idioma (para repintar textos dinámicos). */
export const EVENTO_IDIOMA_CAMBIADO = "quizmania:idioma-cambiado";

/** Idioma activo ahora mismo. */
let idiomaActual: Idioma = "es";

/**
 * Devuelve el idioma que prefiere el navegador (español si empieza por "es",
 * inglés en cualquier otro caso).
 */
export function detectarIdiomaDelNavegador(): Idioma {
    return navigator.language.toLowerCase().startsWith("es") ? "es" : "en";
}

/** Devuelve el idioma activo. */
export function obtenerIdioma(): Idioma {
    return idiomaActual;
}

/**
 * Cambia el idioma activo y vuelve a traducir toda la página.
 * @param nuevoIdioma Idioma a activar.
 */
export function cambiarIdioma(nuevoIdioma: Idioma): void {
    idiomaActual = nuevoIdioma;
    traducirDocumento();
    document.dispatchEvent(new CustomEvent(EVENTO_IDIOMA_CAMBIADO));
}

/**
 * Devuelve el texto de una clave en el idioma activo.
 * @param clave Clave del diccionario.
 */
export function texto(clave: ClaveTexto): string {
    return TEXTOS[idiomaActual][clave];
}

/**
 * Aplica el idioma activo a todos los elementos marcados con data-texto*,
 * al atributo lang del documento y a la meta descripción.
 */
export function traducirDocumento(): void {
    document.documentElement.lang = idiomaActual;
    document.querySelector('meta[name="description"]')?.setAttribute("content", texto("descripcion"));

    document.querySelectorAll<HTMLElement>("[data-texto]").forEach((elemento) => {
        elemento.textContent = texto(elemento.dataset.texto as ClaveTexto);
    });
    document.querySelectorAll<HTMLElement>("[data-texto-aria]").forEach((elemento) => {
        elemento.setAttribute("aria-label", texto(elemento.dataset.textoAria as ClaveTexto));
    });
    document.querySelectorAll<HTMLInputElement>("[data-texto-placeholder]").forEach((elemento) => {
        elemento.placeholder = texto(elemento.dataset.textoPlaceholder as ClaveTexto);
    });
}

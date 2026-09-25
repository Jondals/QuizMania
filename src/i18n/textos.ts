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
        lema: "Trivia con tragaperras",
        titular1a: "Gira los",
        titular1b: "rodillos",
        titular2a: "Descubre tu",
        titular2b: "reto",
        titular3a: "Aprende y",
        titular3b: "diviértete",
        portadaTexto: "Elige un modo, tira de la palanca y responde. Añade a tus amigos y pícate con ellos por la mejor puntuación.",
        datoTemas: "Temas",
        datoModos: "Modos",
        inicio: "Inicio",
        rankingYAmigos: "Ranking y amigos",
        tuPerfil: "Tu perfil",
        modoDeJuego: "Modo de juego",
        tuRecord: "Tu récord",
        pts: "pts",
        puntos: "puntos",
        racha: "Racha de aciertos",
        mejorRacha: "Mejor racha",
        vidas: "Vidas",
        precision: "Precisión",
        record: "Récord",
        terminar: "Terminar partida",
        confirmarTerminar: "¿Terminar la partida ahora? Se guardarán los puntos conseguidos.",
        confirmarAbandonar: "Hay una partida en juego. ¿Abandonarla? No se guardarán los puntos.",
        mensajeRecord: "¡Nuevo récord!",
        nuevoRecord: "🏆 Has batido tu récord personal",
        rondaCompletada: "Partida terminada",
        entreTusAmigos: "Entre tus amigos",
        invitarTexto: "Añade amigos para picarte con ellos",
        invitar: "Invitar amigos",
        verRanking: "Ver ranking",
        volver: "Volver",
        clasificacion: "Clasificación",
        amigos: "Amigos",
        global: "Global",
        tuPosicion: "Tu posición",
        tu: "tú",
        sinJugar: "sin jugar",
        rankingVacio: "Nadie ha jugado este modo todavía. ¡Sé el primero!",
        sinAmigosTodavia: "Aún no tienes amigos añadidos. Comparte tu código y añade el suyo.",
        cargando: "Cargando…",
        conectando: "Conectando…",
        tuCodigo: "Tu código de amigo",
        codigoExplicacion: "Pásaselo a tus amigos para que te añadan.",
        codigoCopiado: "¡Código copiado!",
        enlaceCopiado: "¡Enlace de invitación copiado!",
        copiar: "Copiar",
        compartir: "Compartir",
        textoInvitacion: "¡Pícate conmigo en QuizMania!",
        codigoAmigo: "Código de tu amigo",
        anadir: "Añadir",
        amigoAnadido: "Amigo añadido",
        quitarAmigo: "Quitar amigo",
        confirmarQuitarAmigo: "¿Quitar de tus amigos a",
        codigoNoExiste: "No hay ningún jugador con ese código.",
        codigoNoValido: "El código tiene 6 letras o números.",
        codigoEresTu: "¡Ese es tu propio código!",
        demasiadosAmigos: "Has llegado al máximo de amigos.",
        onlineNoDisponible: "El modo online no está disponible ahora mismo. Tus récords se guardan en este dispositivo.",
        errorOnline: "No se ha podido conectar. Inténtalo de nuevo.",
        tusRecords: "Tus récords en este dispositivo",
        partidas: "partidas",
        nombre: "Nombre",
        avatar: "Avatar",
        colorAvatar: "Color",
        ajustes: "Ajustes",
        cerrar: "Cerrar",
        tiraDeLaPalanca: "¡Tira de la palanca!",
        palanca: "Tirar de la palanca",
        girando: "Girando…",
        temaElegido: "Tema",
        cargandoPreguntas: "Cargando preguntas…",
        traduciendo: "Traduciendo preguntas…",
        errorCarga: "No se han podido cargar las preguntas. Comprueba tu conexión.",
        volverATirar: "Volver a tirar",
        pregunta: "Pregunta",
        de: "de",
        respuestas: "Respuestas",
        aciertos: "Aciertos",
        fallos: "Fallos",
        revisar: "Revisar respuestas",
        jugarDeNuevo: "Jugar de nuevo",
        anterior: "Anterior",
        siguiente: "Siguiente",
        verResultados: "Ver resultados",
        mensajePerfecto: "¡Perfecto! Eres un genio.",
        mensajeBueno: "¡Muy bien!",
        mensajeRegular: "No está mal, ¡sigue practicando!",
        mensajeMalo: "¡A la próxima irá mejor!",
        preguntasLocales: "Sin conexión: usando preguntas guardadas.",
        idioma: "Idioma",
        volumenMusica: "Volumen de la música",
        volumenEfectos: "Volumen de los efectos",
        musica: "Música",
        enlaceMusica: "Pega un link de YouTube o Spotify",
        reproducir: "Reproducir",
        quitarMusica: "Quitar música",
        enlaceNoValido: "Ese link no es de YouTube ni de Spotify.",
        notaSpotify: "Spotify: usa su propio control de volumen. Sin sesión iniciada solo suenan 30 s por canción.",
        reproductor: "Reproductor de música",
        ocultarReproductor: "Ocultar reproductor",
        mostrarReproductor: "Mostrar reproductor",
    },
    en: {
        descripcion: "Trivia game: pull the slot machine lever and answer questions about the topic you get.",
        lema: "Slot machine trivia",
        titular1a: "Spin the",
        titular1b: "reels",
        titular2a: "Find your",
        titular2b: "challenge",
        titular3a: "Learn and",
        titular3b: "have fun",
        portadaTexto: "Pick a mode, pull the lever and answer. Add your friends and compete for the best score.",
        datoTemas: "Topics",
        datoModos: "Modes",
        inicio: "Home",
        rankingYAmigos: "Ranking & friends",
        tuPerfil: "Your profile",
        modoDeJuego: "Game mode",
        tuRecord: "Your best",
        pts: "pts",
        puntos: "points",
        racha: "Answer streak",
        mejorRacha: "Best streak",
        vidas: "Lives",
        precision: "Accuracy",
        record: "Best",
        terminar: "End game",
        confirmarTerminar: "End the game now? Your points so far will be saved.",
        confirmarAbandonar: "A game is in progress. Leave it? Your points won't be saved.",
        mensajeRecord: "New record!",
        nuevoRecord: "🏆 You beat your personal best",
        rondaCompletada: "Game over",
        entreTusAmigos: "Among your friends",
        invitarTexto: "Add friends to compete with them",
        invitar: "Invite friends",
        verRanking: "See ranking",
        volver: "Back",
        clasificacion: "Leaderboard",
        amigos: "Friends",
        global: "Global",
        tuPosicion: "Your position",
        tu: "you",
        sinJugar: "not played",
        rankingVacio: "Nobody has played this mode yet. Be the first!",
        sinAmigosTodavia: "You haven't added any friends yet. Share your code and add theirs.",
        cargando: "Loading…",
        conectando: "Connecting…",
        tuCodigo: "Your friend code",
        codigoExplicacion: "Give it to your friends so they can add you.",
        codigoCopiado: "Code copied!",
        enlaceCopiado: "Invite link copied!",
        copiar: "Copy",
        compartir: "Share",
        textoInvitacion: "Challenge me on QuizMania!",
        codigoAmigo: "Your friend's code",
        anadir: "Add",
        amigoAnadido: "Friend added",
        quitarAmigo: "Remove friend",
        confirmarQuitarAmigo: "Remove from your friends:",
        codigoNoExiste: "There's no player with that code.",
        codigoNoValido: "Codes have 6 letters or numbers.",
        codigoEresTu: "That's your own code!",
        demasiadosAmigos: "You've reached the friend limit.",
        onlineNoDisponible: "Online mode isn't available right now. Your records are saved on this device.",
        errorOnline: "Couldn't connect. Please try again.",
        tusRecords: "Your records on this device",
        partidas: "games",
        nombre: "Name",
        avatar: "Avatar",
        colorAvatar: "Color",
        ajustes: "Settings",
        cerrar: "Close",
        tiraDeLaPalanca: "Pull the lever!",
        palanca: "Pull the lever",
        girando: "Spinning…",
        temaElegido: "Topic",
        cargandoPreguntas: "Loading questions…",
        traduciendo: "Translating questions…",
        errorCarga: "Questions could not be loaded. Check your connection.",
        volverATirar: "Pull again",
        pregunta: "Question",
        de: "of",
        respuestas: "Answers",
        aciertos: "Correct",
        fallos: "Wrong",
        revisar: "Review answers",
        jugarDeNuevo: "Play again",
        anterior: "Previous",
        siguiente: "Next",
        verResultados: "See results",
        mensajePerfecto: "Perfect! You're a genius.",
        mensajeBueno: "Well done!",
        mensajeRegular: "Not bad, keep practising!",
        mensajeMalo: "Better luck next time!",
        preguntasLocales: "Offline: using saved questions.",
        idioma: "Language",
        volumenMusica: "Music volume",
        volumenEfectos: "Sound effects volume",
        musica: "Music",
        enlaceMusica: "Paste a YouTube or Spotify link",
        reproducir: "Play",
        quitarMusica: "Remove music",
        enlaceNoValido: "That link is not from YouTube or Spotify.",
        notaSpotify: "Spotify: use its own volume control. Without being logged in, only 30 s previews play.",
        reproductor: "Music player",
        ocultarReproductor: "Hide player",
        mostrarReproductor: "Show player",
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

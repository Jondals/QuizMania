/**
 * temas.ts
 * Catálogo de los 30 temas del juego: nombre en cada idioma, icono que sale
 * en los rodillos de la tragaperras, color, archivo JSON de respaldo (sin
 * conexión) y de qué API online se sacan sus preguntas (algunos temas solo
 * tienen preguntas locales).
 */

import type { Idioma } from "../i18n/textos";

/**
 * De dónde salen las preguntas online de un tema.
 * - opentdb: Open Trivia DB (categoría numérica; sin categoría = cualquiera).
 * - trivia-api: The Trivia API (categoría por nombre).
 */
export type FuenteOnline =
    | { api: "opentdb"; categoria?: number }
    | { api: "trivia-api"; categoria: string };

/** Datos de un tema. */
export interface Tema {
    id: string;
    nombre: Record<Idioma, string>;
    /** Emoji que aparece en los rodillos. */
    icono: string;
    /** Color de acento del tema (solo decorativo: bordes y brillos). */
    color: string;
    /**
     * Archivo JSON local (en español) que se usa si no hay conexión.
     * null = mezcla de todos los temas (el tema "Al azar").
     */
    archivoLocal: string | null;
    /** API online; null = solo preguntas locales. */
    fuenteOnline: FuenteOnline | null;
}

/**
 * Crea un tema con archivo local "preguntas/<id>.json".
 * @param id Identificador (y nombre del archivo).
 * @param es Nombre en español.
 * @param en Nombre en inglés.
 * @param icono Emoji.
 * @param color Color de acento.
 * @param fuenteOnline API online (null = solo local).
 */
function tema(id: string, es: string, en: string, icono: string, color: string, fuenteOnline: FuenteOnline | null): Tema {
    return { id, nombre: { es, en }, icono, color, archivoLocal: `preguntas/${id}.json`, fuenteOnline };
}

/** Lista de temas en el orden en que aparecen en los rodillos. */
export const TEMAS: readonly Tema[] = [
    {
        id: "azar",
        nombre: { es: "Al azar", en: "Random" },
        icono: "🎲",
        color: "#ffb74d",
        archivoLocal: null,
        fuenteOnline: { api: "opentdb" },
    },
    tema("cultura-general", "Cultura general", "General knowledge", "🧠", "#f9a8d4", { api: "opentdb", categoria: 9 }),
    tema("historia", "Historia", "History", "🏛️", "#ffd54f", { api: "opentdb", categoria: 23 }),
    tema("ciencia", "Ciencia", "Science", "🔬", "#4fc3f7", { api: "opentdb", categoria: 17 }),
    tema("mecanica", "Mecánica", "Mechanics", "🔧", "#4dd0e1", { api: "opentdb", categoria: 28 }),
    tema("geografia", "Geografía", "Geography", "🌍", "#81c784", { api: "opentdb", categoria: 22 }),
    tema("programacion", "Programación", "Programming", "💻", "#ffca28", { api: "opentdb", categoria: 18 }),
    tema("comida", "Comida", "Food", "🍕", "#f48fb1", { api: "trivia-api", categoria: "food_and_drink" }),
    tema("deportes", "Deportes", "Sports", "⚽", "#b39ddb", { api: "opentdb", categoria: 21 }),
    tema("cine", "Cine", "Film", "🎬", "#ff6b6b", { api: "opentdb", categoria: 11 }),
    tema("musica", "Música", "Music", "🎵", "#c084fc", { api: "trivia-api", categoria: "music" }),
    tema("series", "Series y TV", "TV shows", "📺", "#60a5fa", { api: "opentdb", categoria: 14 }),
    tema("videojuegos", "Videojuegos", "Video games", "🎮", "#34d399", { api: "opentdb", categoria: 15 }),
    tema("literatura", "Literatura", "Books", "📚", "#fbbf24", { api: "opentdb", categoria: 10 }),
    tema("arte", "Arte", "Art", "🎨", "#fb7185", { api: "opentdb", categoria: 25 }),
    tema("animales", "Animales", "Animals", "🐾", "#a3e635", { api: "opentdb", categoria: 27 }),
    tema("mitologia", "Mitología", "Mythology", "⚡", "#facc15", { api: "opentdb", categoria: 20 }),
    tema("matematicas", "Matemáticas", "Maths", "➗", "#22d3ee", { api: "opentdb", categoria: 19 }),
    tema("anime", "Anime y manga", "Anime & manga", "🍥", "#f472b6", { api: "opentdb", categoria: 31 }),
    tema("comics", "Cómics", "Comics", "🦸", "#f87171", { api: "opentdb", categoria: 29 }),
    tema("juegos-mesa", "Juegos de mesa", "Board games", "♟️", "#e5e7eb", { api: "opentdb", categoria: 16 }),
    tema("teatro", "Teatro y musicales", "Theatre & musicals", "🎭", "#e879f9", { api: "opentdb", categoria: 13 }),
    tema("famosos", "Famosos", "Celebrities", "⭐", "#fde047", { api: "opentdb", categoria: 26 }),
    tema("tecnologia", "Tecnología", "Gadgets & tech", "📱", "#38bdf8", { api: "opentdb", categoria: 30 }),
    tema("dibujos", "Dibujos animados", "Cartoons", "🐭", "#fdba74", { api: "opentdb", categoria: 32 }),
    tema("sociedad", "Sociedad y cultura", "Society & culture", "🌐", "#5eead4", { api: "trivia-api", categoria: "society_and_culture" }),
    tema("astronomia", "Astronomía", "Astronomy", "🪐", "#818cf8", null),
    tema("espana", "España", "Spain", "🇪🇸", "#ef4444", null),
    tema("cuerpo-humano", "Cuerpo humano", "Human body", "🫀", "#fb7185", null),
    tema("inventos", "Inventos", "Inventions", "💡", "#fcd34d", null),
];

/** Archivos locales de todos los temas (para el tema "Al azar" y como último recurso). */
export const TODOS_LOS_ARCHIVOS_LOCALES: readonly string[] = TEMAS.flatMap((t) => (t.archivoLocal ? [t.archivoLocal] : []));

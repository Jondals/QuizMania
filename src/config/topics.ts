/**
 * topics.ts
 * The 30 game topics: name in each language, the short name printed on the
 * slot-machine chip, an icon for the chip and badges, a colour, the local backup file
 * (offline questions in Spanish) and the online APIs its questions come from,
 * in order of preference.
 */

import type { Language } from "../i18n/texts";

/**
 * Where a topic's online questions come from.
 * - opentdb: Open Trivia DB (numeric category; none = any category).
 * - trivia-api: The Trivia API (category names and/or tags; none = any).
 */
export type OnlineSource =
    | { api: "opentdb"; category?: number }
    | { api: "trivia-api"; categories?: string; tags?: string };

/** A topic. */
export interface Topic {
    id: string;
    name: Record<Language, string>;
    /** Short name printed on the reel plate (fits in a narrow window). */
    short: Record<Language, string>;
    /** Emoji shown on its reel chip and in badges. */
    icon: string;
    /** Accent colour (plates, borders and glows). */
    color: string;
    /** Local JSON (Spanish) used when offline; null = mix of every topic ("Random"). */
    localFile: string | null;
    /** Online sources, in order of preference (tried one after another). */
    sources: readonly OnlineSource[];
}

/** Shortcut for an Open Trivia DB source. */
const otdb = (category?: number): OnlineSource => ({ api: "opentdb", category });
/** Shortcut for a The Trivia API source by category. */
const tapiCategory = (categories: string): OnlineSource => ({ api: "trivia-api", categories });
/** Shortcut for a The Trivia API source by tags. */
const tapiTags = (tags: string): OnlineSource => ({ api: "trivia-api", tags });

/**
 * Builds a topic whose local file is "questions/<id>.json".
 * @param id Identifier (and file name).
 * @param es Spanish name and short name.
 * @param en English name and short name.
 * @param icon Emoji.
 * @param color Accent colour.
 * @param sources Online sources.
 */
function topic(id: string, es: [string, string], en: [string, string], icon: string, color: string, sources: OnlineSource[]): Topic {
    return { id, name: { es: es[0], en: en[0] }, short: { es: es[1], en: en[1] }, icon, color, localFile: `questions/${id}.json`, sources };
}

/** Every topic, in reel order. */
export const TOPICS: readonly Topic[] = [
    {
        id: "azar",
        name: { es: "Al azar", en: "Random" },
        short: { es: "Al azar", en: "Random" },
        icon: "🎲",
        color: "#ffb74d",
        localFile: null,
        sources: [{ api: "trivia-api" }, otdb()],
    },
    topic("cultura-general", ["Cultura general", "Cultura"], ["General knowledge", "Trivia"], "🧠", "#f9a8d4", [tapiCategory("general_knowledge"), otdb(9)]),
    topic("historia", ["Historia", "Historia"], ["History", "History"], "🏛️", "#ffd54f", [tapiCategory("history"), otdb(23)]),
    topic("ciencia", ["Ciencia", "Ciencia"], ["Science", "Science"], "🔬", "#4fc3f7", [tapiCategory("science"), otdb(17)]),
    topic("mecanica", ["Mecánica", "Motor"], ["Mechanics", "Motors"], "🔧", "#4dd0e1", [otdb(28), tapiTags("cars")]),
    topic("geografia", ["Geografía", "Geograf."], ["Geography", "Geo"], "🌍", "#81c784", [tapiCategory("geography"), otdb(22)]),
    topic("programacion", ["Programación", "Código"], ["Programming", "Code"], "💻", "#ffca28", [otdb(18), tapiTags("computing")]),
    topic("comida", ["Comida", "Comida"], ["Food", "Food"], "🍕", "#f48fb1", [tapiCategory("food_and_drink")]),
    topic("deportes", ["Deportes", "Deporte"], ["Sports", "Sports"], "⚽", "#b39ddb", [tapiCategory("sport_and_leisure"), otdb(21)]),
    topic("cine", ["Cine", "Cine"], ["Film", "Film"], "🎬", "#ff6b6b", [tapiTags("film"), otdb(11)]),
    topic("musica", ["Música", "Música"], ["Music", "Music"], "🎵", "#c084fc", [tapiCategory("music"), otdb(12)]),
    topic("series", ["Series y TV", "Series"], ["TV shows", "TV"], "📺", "#60a5fa", [tapiTags("tv"), otdb(14)]),
    topic("videojuegos", ["Videojuegos", "Gaming"], ["Video games", "Gaming"], "🎮", "#34d399", [otdb(15), tapiTags("video_games")]),
    topic("literatura", ["Literatura", "Libros"], ["Books", "Books"], "📚", "#fbbf24", [tapiTags("literature"), otdb(10)]),
    topic("arte", ["Arte", "Arte"], ["Art", "Art"], "🎨", "#fb7185", [tapiTags("art"), otdb(25)]),
    topic("animales", ["Animales", "Animales"], ["Animals", "Animals"], "🐾", "#a3e635", [tapiTags("animals"), otdb(27)]),
    topic("mitologia", ["Mitología", "Mitos"], ["Mythology", "Myths"], "⚡", "#facc15", [tapiTags("mythology"), otdb(20)]),
    topic("matematicas", ["Matemáticas", "Mates"], ["Maths", "Maths"], "➗", "#22d3ee", [tapiTags("mathematics"), otdb(19)]),
    topic("anime", ["Anime y manga", "Anime"], ["Anime & manga", "Anime"], "🍥", "#f472b6", [otdb(31)]),
    topic("comics", ["Cómics", "Cómics"], ["Comics", "Comics"], "🦸", "#f87171", [tapiTags("comics"), otdb(29)]),
    topic("juegos-mesa", ["Juegos de mesa", "Tablero"], ["Board games", "Board"], "♟️", "#e5e7eb", [otdb(16), tapiTags("board_games")]),
    topic("teatro", ["Teatro y musicales", "Teatro"], ["Theatre & musicals", "Theatre"], "🎭", "#e879f9", [otdb(13), tapiTags("musicals")]),
    topic("famosos", ["Famosos", "Famosos"], ["Celebrities", "Stars"], "⭐", "#fde047", [otdb(26)]),
    topic("tecnologia", ["Tecnología", "Tecno"], ["Gadgets & tech", "Tech"], "📱", "#38bdf8", [tapiTags("technology"), otdb(30)]),
    topic("dibujos", ["Dibujos animados", "Dibujos"], ["Cartoons", "Cartoons"], "🐭", "#fdba74", [otdb(32), tapiTags("cartoons")]),
    topic("sociedad", ["Sociedad y cultura", "Sociedad"], ["Society & culture", "Society"], "🌐", "#5eead4", [tapiCategory("society_and_culture")]),
    topic("astronomia", ["Astronomía", "Espacio"], ["Astronomy", "Space"], "🪐", "#818cf8", [tapiTags("astronomy,space")]),
    topic("espana", ["España", "España"], ["Spain", "Spain"], "🇪🇸", "#ef4444", [tapiTags("spain")]),
    topic("cuerpo-humano", ["Cuerpo humano", "Cuerpo"], ["Human body", "Body"], "🫀", "#fb7185", [tapiTags("anatomy,biology")]),
    topic("inventos", ["Inventos", "Inventos"], ["Inventions", "Invent."], "💡", "#fcd34d", [tapiTags("inventions")]),
];

/** Local files of every topic (used by "Random" and as a last resort). */
export const ALL_LOCAL_FILES: readonly string[] = TOPICS.flatMap((item) => (item.localFile ? [item.localFile] : []));

/**
 * Finds a topic by id (falls back to "Random").
 * @param id Topic id.
 */
export function findTopic(id: string): Topic {
    return TOPICS.find((item) => item.id === id) ?? TOPICS[0];
}

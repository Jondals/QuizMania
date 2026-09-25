/**
 * build.mjs
 * Compila QuizMania para producción (lo ejecuta Vercel con `npm run build`):
 *   1. Borra dist/.
 *   2. Copia public/ (HTML, imágenes, preguntas) a dist/.
 *   3. Empaqueta y minifica src/main.ts con esbuild en dist/assets/main-[hash].js
 *      (el hash cambia con cada versión, así se puede cachear para siempre).
 *   4. Minifica style.css y lo incrusta en el HTML (una petición menos).
 *   5. Enlaza el JS con hash desde el HTML.
 * La comprobación de tipos la hace `tsc` antes de este script.
 *
 * Supabase se configura con las variables de entorno SUPABASE_URL y
 * SUPABASE_ANON_KEY (o sus equivalentes NEXT_PUBLIC_… que muestra Supabase).
 * En Vercel: Settings → Environment Variables; en local, un archivo .env o
 * .env.local. Sin ellas el juego funciona igual, pero sin cuentas.
 */

import { build, transform } from "esbuild";
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const CARPETA_SALIDA = "dist";

/**
 * Carga las variables de un archivo de entorno (si existe) sin pisar las del sistema.
 * @param archivo Ruta del archivo (.env o .env.local).
 */
function cargarArchivoEnv(archivo) {
    if (!existsSync(archivo)) {
        return;
    }
    for (const linea of readFileSync(archivo, "utf8").split(/\r?\n/)) {
        const coincidencia = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
        if (coincidencia && process.env[coincidencia[1]] === undefined) {
            process.env[coincidencia[1]] = coincidencia[2].replace(/^["']|["']$/g, "");
        }
    }
}

/**
 * Devuelve la primera variable de entorno definida de la lista.
 * Se aceptan también los nombres que muestra Supabase para Next.js
 * (NEXT_PUBLIC_…), así se pueden copiar tal cual.
 * @param nombres Nombres posibles, por orden de preferencia.
 */
function leerVariable(...nombres) {
    for (const nombre of nombres) {
        if (process.env[nombre]) return process.env[nombre].trim();
    }
    return "";
}

cargarArchivoEnv(".env.local");
cargarArchivoEnv(".env");
const SUPABASE_URL = leerVariable("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_ANON_KEY = leerVariable(
    "SUPABASE_ANON_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
);

/** Borra la salida anterior y copia los archivos estáticos. */
function copiarArchivosEstaticos() {
    rmSync(CARPETA_SALIDA, { recursive: true, force: true });
    cpSync("public", CARPETA_SALIDA, {
        recursive: true,
        filter: (ruta) => basename(ruta) !== "style.css",
    });
}

/** Empaqueta el TypeScript y devuelve el nombre del archivo generado. */
async function empaquetarJavaScript() {
    const resultado = await build({
        entryPoints: ["src/main.ts"],
        bundle: true,
        minify: true,
        format: "esm",
        target: ["es2020", "chrome90", "firefox90", "safari15"],
        outdir: `${CARPETA_SALIDA}/assets`,
        entryNames: "[name]-[hash]",
        metafile: true,
        legalComments: "none",
        define: {
            __SUPABASE_URL__: JSON.stringify(SUPABASE_URL),
            __SUPABASE_ANON_KEY__: JSON.stringify(SUPABASE_ANON_KEY),
        },
    });
    const archivoGenerado = Object.keys(resultado.metafile.outputs).find((ruta) => ruta.endsWith(".js"));
    return archivoGenerado.replace(`${CARPETA_SALIDA}/`, "");
}

/** Devuelve el CSS minificado. */
async function minificarCss() {
    const { code } = await transform(readFileSync("public/style.css", "utf8"), {
        loader: "css",
        minify: true,
        target: ["chrome90", "firefox90", "safari15"],
    });
    return code.trim();
}

/**
 * Genera el index.html final con el CSS incrustado y el JS con hash.
 * @param rutaJavaScript Ruta del JS generado.
 * @param css CSS minificado.
 */
function generarHtml(rutaJavaScript, css) {
    let html = readFileSync("public/index.html", "utf8");
    const enlaceCss = '<link rel="stylesheet" href="style.css">';
    const scriptOriginal = '<script type="module" src="main.js"></script>';
    if (!html.includes(enlaceCss) || !html.includes(scriptOriginal)) {
        throw new Error("index.html no tiene el <link> de style.css o el <script> de main.js esperados");
    }
    html = html
        .replace(/<!--[\s\S]*?-->\s*/g, "")
        .replace(enlaceCss, () => `<style>${css}</style>`)
        .replace(scriptOriginal, `<script type="module" src="${rutaJavaScript}"></script>`);
    writeFileSync(`${CARPETA_SALIDA}/index.html`, html);
}

copiarArchivosEstaticos();
const rutaJavaScript = await empaquetarJavaScript();
generarHtml(rutaJavaScript, await minificarCss());
console.log(`QuizMania compilado en ${CARPETA_SALIDA}/ (${rutaJavaScript})`);
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn("Aviso: faltan SUPABASE_URL o SUPABASE_ANON_KEY; el juego se compila sin cuentas ni ranking.");
}

/**
 * build.mjs
 * Compila QuizMania para producción (lo ejecuta Vercel con `npm run build`):
 *   1. Borra dist/.
 *   2. Copia public/ (HTML, imágenes, sonidos, preguntas) a dist/.
 *   3. Empaqueta y minifica src/main.ts con esbuild en dist/assets/main-[hash].js
 *      (el hash cambia con cada versión, así se puede cachear para siempre).
 *   4. Minifica style.css y lo incrusta en el HTML (una petición menos).
 *   5. Enlaza el JS con hash desde el HTML.
 * La comprobación de tipos la hace `tsc` antes de este script.
 */

import { build, transform } from "esbuild";
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const CARPETA_SALIDA = "dist";

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

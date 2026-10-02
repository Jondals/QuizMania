/**
 * build.mjs
 * Builds QuizMania for production (Vercel runs it with `pnpm run build`):
 *   1. Deletes dist/.
 *   2. Copies public/ (HTML, images, questions) to dist/.
 *   3. Bundles and minifies src/main.ts with esbuild into
 *      dist/assets/main-[hash].js (the hash changes with every version, so it
 *      can be cached forever). Dynamic imports (the Supabase library) are
 *      split into dist/assets/chunks/ and only downloaded when needed.
 *   4. Minifies style.css (what the first screen needs) and inlines it in the
 *      HTML (one request less).
 *   5. Minifies deferred.css into dist/assets/deferred-[hash].css and links it
 *      so it doesn't block the first paint.
 *   6. Collapses extra whitespace in the HTML, links the hashed JS and writes
 *      the version (from package.json) in the footer.
 * Type checking is done by `tsc` before this script.
 *
 * Supabase is configured with the SUPABASE_URL and SUPABASE_ANON_KEY
 * environment variables (or the NEXT_PUBLIC_… equivalents Supabase shows).
 * On Vercel: Settings → Environment Variables; locally, a .env or
 * .env.local file. Without them the game still works, just without accounts.
 */

import { build, transform } from "esbuild";
import { createHash } from "node:crypto";
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const OUTPUT_DIR = "dist";
const VERSION = JSON.parse(readFileSync("package.json", "utf8")).version;

/**
 * Loads the variables of an environment file (if it exists) without
 * overriding the ones already set in the system.
 * @param file Path of the file (.env or .env.local).
 */
function loadEnvFile(file) {
    if (!existsSync(file)) return;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
        if (match && process.env[match[1]] === undefined) {
            process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
        }
    }
}

/**
 * Returns the first defined environment variable of the list. The names
 * Supabase shows for Next.js (NEXT_PUBLIC_…) are accepted too, so they can
 * be copied as they are.
 * @param names Possible names, in order of preference.
 */
function readVariable(...names) {
    for (const name of names) {
        if (process.env[name]) return process.env[name].trim();
    }
    return "";
}

loadEnvFile(".env.local");
loadEnvFile(".env");
const SUPABASE_URL = readVariable("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_ANON_KEY = readVariable("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY");

/** Deletes the previous output and copies the static files. */
function copyStaticFiles() {
    rmSync(OUTPUT_DIR, { recursive: true, force: true });
    cpSync("public", OUTPUT_DIR, {
        recursive: true,
        filter: (path) => !["style.css", "deferred.css"].includes(basename(path)),
    });
}

/** Bundles the TypeScript and returns the generated file name. */
async function bundleJavaScript() {
    const result = await build({
        entryPoints: ["src/main.ts"],
        bundle: true,
        minify: true,
        format: "esm",
        target: ["es2020", "chrome90", "firefox90", "safari15"],
        outdir: `${OUTPUT_DIR}/assets`,
        entryNames: "[name]-[hash]",
        chunkNames: "chunks/[name]-[hash]",
        splitting: true,
        metafile: true,
        legalComments: "none",
        define: {
            __SUPABASE_URL__: JSON.stringify(SUPABASE_URL),
            __SUPABASE_ANON_KEY__: JSON.stringify(SUPABASE_ANON_KEY),
            __APP_VERSION__: JSON.stringify(VERSION),
        },
    });
    const [generated] = Object.entries(result.metafile.outputs).find(([, output]) => output.entryPoint === "src/main.ts");
    return generated.replace(`${OUTPUT_DIR}/`, "");
}

/**
 * Returns minified CSS.
 * @param file CSS path.
 */
async function minifyCss(file) {
    const { code } = await transform(readFileSync(file, "utf8"), {
        loader: "css",
        minify: true,
        target: ["chrome90", "firefox90", "safari15"],
    });
    return code.trim();
}

/**
 * Minifies deferred.css and saves it with a hash in dist/assets.
 * @returns Path of the generated file (relative to dist/).
 */
async function generateDeferredCss() {
    const css = await minifyCss("public/deferred.css");
    const hash = createHash("sha256").update(css).digest("hex").slice(0, 8).toUpperCase();
    const path = `assets/deferred-${hash}.css`;
    writeFileSync(`${OUTPUT_DIR}/${path}`, css);
    return path;
}

/**
 * Collapses extra whitespace in the HTML (outside <style> and <script>).
 * It doesn't change how it looks: the browser already treats several spaces as one.
 * @param html HTML to compact.
 */
function compactHtml(html) {
    return html
        .split(/(<style>[\s\S]*?<\/style>|<script[\s\S]*?<\/script>)/)
        .map((chunk) => (chunk.startsWith("<style>") || chunk.startsWith("<script") ? chunk : chunk.replace(/\s{2,}/g, " ")))
        .join("");
}

/**
 * Generates the final index.html with the first screen's CSS inlined, the
 * rest of the CSS non-blocking and the hashed JS.
 * @param javaScriptPath Path of the generated JS.
 * @param css Minified CSS of the first screen.
 * @param deferredCssPath Path of the CSS of the other screens.
 */
function generateHtml(javaScriptPath, css, deferredCssPath) {
    let html = readFileSync("public/index.html", "utf8");
    const cssLink = '<link rel="stylesheet" href="style.css">';
    const deferredLink = '<link rel="stylesheet" href="deferred.css">';
    const originalScript = '<script type="module" src="main.js"></script>';
    if (!html.includes(cssLink) || !html.includes(deferredLink) || !html.includes(originalScript)) {
        throw new Error("index.html lacks the expected <link> of style.css and deferred.css or the <script> of main.js");
    }
    // media="print" keeps it from blocking; once loaded it applies to the screen.
    const nonBlocking =
        `<link rel="stylesheet" href="${deferredCssPath}" media="print" onload="this.media='all'">` +
        `<noscript><link rel="stylesheet" href="${deferredCssPath}"></noscript>`;
    html = html
        .replace(/<!--[\s\S]*?-->\s*/g, "")
        .replace(cssLink, () => `<style>${css}</style>`)
        .replace(deferredLink, () => nonBlocking)
        .replace(originalScript, `<script type="module" src="${javaScriptPath}"></script>`)
        .replace("%APP_VERSION%", VERSION);
    writeFileSync(`${OUTPUT_DIR}/index.html`, compactHtml(html));
}

copyStaticFiles();
const javaScriptPath = await bundleJavaScript();
const deferredCssPath = await generateDeferredCss();
generateHtml(javaScriptPath, await minifyCss("public/style.css"), deferredCssPath);
console.log(`QuizMania built in ${OUTPUT_DIR}/ (${javaScriptPath})`);
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn("Warning: SUPABASE_URL or SUPABASE_ANON_KEY is missing; the game is built without accounts or ranking.");
}

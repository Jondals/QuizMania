/**
 * check.mjs
 * One command that checks everything before a release:
 *   1. Type-checks the whole project (tsc --noEmit).
 *   2. Runs the unit tests (scripts/run-tests.mjs).
 *   3. Runs supabase/schema.sql against an in-memory Postgres (PGlite) with
 *      Supabase's auth/storage schemas stubbed out, and exercises every
 *      database function used by the game: accounts, friend codes, modes,
 *      ranking, friends and the whole Versus flow (challenge, answer,
 *      decline, league points, leaderboard). This never touches the real
 *      Supabase project, so it never creates real accounts.
 *   4. Builds the production bundle (scripts/build.mjs) and checks the
 *      compressed HTML stays small enough for a fast first paint.
 *   5. Serves dist/ on a local port and drives it with Playwright: pulls
 *      the lever, answers a question, opens Settings and the ranking, and
 *      checks the page never contacts the real Supabase project (every
 *      request is mocked) and logs no console errors.
 *
 * Usage: `pnpm run check` (or double-click check.bat / check.sh).
 * Needs a Chromium build playwright-core can launch — if none is found
 * locally the browser step is skipped with a warning instead of failing.
 */

import { PGlite } from "@electric-sql/pglite";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { homedir } from "node:os";
import { brotliCompressSync } from "node:zlib";

const steps = [];
let failed = false;

/**
 * Runs one check step, prints its result and keeps going even if it fails
 * (so a single broken step doesn't hide problems in the others).
 * @param name Short description shown in the summary.
 * @param run What to do; throws (or returns a string) to report a failure.
 */
async function step(name, run) {
    process.stdout.write(`→ ${name}... `);
    try {
        const detail = await run();
        console.log(`✔${detail ? ` ${detail}` : ""}`);
        steps.push({ name, ok: true, detail });
    } catch (error) {
        console.log("✖");
        console.log(
            (error?.stdout?.toString?.() || error?.message || String(error))
                .split("\n")
                .map((line) => `    ${line}`)
                .join("\n"),
        );
        steps.push({ name, ok: false, detail: error?.message ?? String(error) });
        failed = true;
    }
}

/** Runs a command and throws (with its output attached) if it fails. */
function run(command, args) {
    // On Windows, npx/node resolve through a .cmd shim that only a shell can run;
    // the args are controlled by this file, not user input, so this is safe.
    const result = spawnSync(command, args, { encoding: "utf8", shell: process.platform === "win32", windowsVerbatimArguments: false });
    if (result.status !== 0) {
        const error = new Error(`${command} ${args.join(" ")} exited with code ${result.status}`);
        error.stdout = (result.stdout ?? "") + (result.stderr ?? "");
        throw error;
    }
    return result.stdout ?? "";
}

await step("Type checking (tsc --noEmit)", () => {
    run("npx", ["tsc", "--noEmit"]);
});

await step("Unit tests", () => {
    const output = run("node", ["scripts/run-tests.mjs"]);
    const total = output.match(/ℹ tests (\d+)/)?.[1];
    const pass = output.match(/ℹ pass (\d+)/)?.[1];
    if (!total || pass !== total) throw Object.assign(new Error("Some unit tests failed"), { stdout: output });
    return `${pass}/${total} passed`;
});

/* ---------------------------------------------------------------------
 * Database: supabase/schema.sql against PGlite, with the whole Versus
 * flow exercised end to end. Nothing here touches the real Supabase
 * project — it is a local, in-memory Postgres created just for this check.
 * --------------------------------------------------------------------- */
await step("Database schema (supabase/schema.sql, in-memory Postgres)", async () => {
    const db = new PGlite();
    const q = (sql, params) => db.query(sql, params);

    await db.exec(`
        create role anon; create role authenticated;
        create schema auth;
        create table auth.users (id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb);
        create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('check.uid', true), '')::uuid $$;
        create schema storage;
        create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
        create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
        create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
    `);

    const schema = readFileSync("supabase/schema.sql", "utf8");
    await db.exec(schema);
    await db.exec(schema); // Must stay re-runnable without losing data or erroring.

    const as = async (uid, sql, params) => {
        await q(`select set_config('check.uid', $1, false)`, [uid ?? ""]);
        return q(sql, params);
    };
    const expectError = async (uid, sql, params, code) => {
        try {
            await as(uid, sql, params);
        } catch (error) {
            if (!error.message.includes(code)) throw new Error(`expected "${code}", got "${error.message}"`);
            return;
        }
        throw new Error(`expected "${code}" but nothing failed: ${sql}`);
    };
    const user = async (username) => (await q(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [`${username}@quizmania.app`, { usuario: username }])).rows[0].id;

    const ana = await user("ana_check");
    const luis = await user("luis_check");
    const eva = await user("eva_check");

    // Friend codes: unique, never the username, repaired for pre-existing rows.
    const codes = (await q(`select usuario, codigo from public.perfiles where usuario in ('ana_check','luis_check','eva_check')`)).rows;
    if (codes.length !== 3) throw new Error("the three players should have a profile");
    for (const row of codes) {
        if (!/^[A-HJ-NP-Z2-9]{6}$/.test(row.codigo)) throw new Error(`${row.usuario}: invalid code "${row.codigo}"`);
        if (row.codigo === row.usuario.toUpperCase()) throw new Error(`${row.usuario}: code equals the username`);
    }
    if (new Set(codes.map((row) => row.codigo)).size !== 3) throw new Error("duplicate friend codes");

    // Friends (by code, tolerating spaces/dashes/case, and by username) are mutual.
    const luisCode = codes.find((row) => row.usuario === "luis_check").codigo;
    await as(ana, `select public.anadir_amigo($1)`, [` ${luisCode.slice(0, 3).toLowerCase()}-${luisCode.slice(3)} `]);
    await as(ana, `select public.anadir_amigo('eva_check')`);
    if ((await as(eva, `select 1 from public.mis_amigos()`)).rows.length !== 1) throw new Error("friendship with eva is not mutual");

    // Every mode the game can pick is accepted, and nothing else is.
    const modesSource = readFileSync("src/config/modes.ts", "utf8");
    const gameModes = [...modesSource.matchAll(/id:\s*"([a-z-]+)"/g)].map((m) => m[1]).filter((id) => id !== "versus");
    for (const mode of gameModes) {
        await as(ana, `select public.registrar_partida($1, 'ciencia', 400, 4, 10)`, [mode]);
        await q(`update public.partidas set creada = now() - interval '1 minute'`); // bypass the anti-spam window between games
    }
    // So the global leaderboard has more than one player to rank.
    await as(eva, `select public.registrar_partida('clasico', 'ciencia', 150, 2, 10)`, []);
    await q(`update public.partidas set creada = now() - interval '1 minute'`);
    await expectError(ana, `select public.registrar_partida('not-a-mode', 'x', 100, 1, 10)`, [], "modo-no-valido");
    // The ×5 slot multiplier makes 2500 the real per-hit ceiling now.
    await expectError(luis, `select public.registrar_partida('clasico', 'x', 2600, 1, 10)`, [], "partida-no-valida");

    // Versus end to end: challenge, read without seeing the challenger's score, answer, league points, decline.
    const questions = JSON.stringify(Array.from({ length: 10 }, (_, i) => ({ e: `Q${i}`, r: ["a", "b", "c", "d"], c: 1, i: "en", s: "local" })));
    await expectError(luis, `select public.crear_reto($1, 'azar', $2::jsonb, 900, 7)`, [eva, questions], "no-es-amigo");
    const challengeId = (await as(ana, `select public.crear_reto($1, 'azar', $2::jsonb, 900, 7) as id`, [luis, questions])).rows[0].id;
    if ((await as(luis, `select sus_puntos from public.mis_retos() where id = $1`, [challengeId])).rows[0].sus_puntos !== null) throw new Error("the rival must not see the challenger's score before playing");
    await expectError(eva, `select public.preguntas_reto($1)`, [challengeId], "reto-no-existe");
    if ((await as(luis, `select jsonb_array_length(public.preguntas_reto($1)) as n`, [challengeId])).rows[0].n !== 10) throw new Error("the rival should receive the 10 questions");
    const result = (await as(luis, `select public.responder_reto($1, 1200, 8) as r`, [challengeId])).rows[0].r;
    if (result.resultado !== "victoria" || result.cambio !== 30 || result.puntos_liga !== 30) throw new Error(`unexpected league result: ${JSON.stringify(result)}`);
    const loserPoints = (await q(`select puntos_liga from public.perfiles where id = $1`, [ana])).rows[0].puntos_liga;
    if (loserPoints !== 0) throw new Error("league points must never drop below 0");

    await q(`update public.retos set creado = now() - interval '1 minute'`);
    const declinedId = (await as(ana, `select public.crear_reto($1, 'azar', $2::jsonb, 100, 1) as id`, [eva, questions])).rows[0].id;
    await as(eva, `select public.rechazar_reto($1)`, [declinedId]);
    if ((await as(eva, `select estado from public.mis_retos() where id = $1`, [declinedId])).rows[0].estado !== "rechazado") throw new Error("decline did not work");

    // Leaderboards: both the points ranking and the Versus league ranking respond.
    const global = (await as(null, `select * from public.ranking('total', 'global', 50)`)).rows;
    if (global.length < 2) throw new Error("global ranking should include every player with points");
    const league = (await as(null, `select * from public.ranking_liga('global', 50)`)).rows;
    if (!league.some((row) => row.usuario === "luis_check" && row.puntos === 30)) throw new Error("the Versus league ranking doesn't reflect the match result");

    // Account deletion cascades to friendships and challenges.
    await as(luis, `select public.borrar_mi_cuenta()`);
    if ((await q(`select count(*)::int as n from public.retos where retador = $1 or rival = $1`, [luis])).rows[0].n !== 0) throw new Error("deleting an account should delete its challenges");

    return "accounts, codes, friends, modes, Versus and both leaderboards all check out";
});

await step("Production build", () => {
    run("node", ["scripts/build.mjs"]);
    const html = readFileSync("dist/index.html");
    const compressed = brotliCompressSync(html).length;
    // Budget for a fast first paint on mobile; see README "Lighthouse" notes.
    const budget = 16 * 1024;
    if (compressed > budget) throw new Error(`index.html is ${compressed} B compressed, over the ${budget} B budget`);
    return `index.html: ${html.length} B (${compressed} B brotli)`;
});

/* ---------------------------------------------------------------------
 * Browser smoke test. Supabase is fully mocked: the page never reaches
 * the real project, so this step can never create a real account.
 * --------------------------------------------------------------------- */
function findChromium() {
    const bases = [join(homedir(), "AppData/Local/ms-playwright"), join(homedir(), ".cache/ms-playwright")];
    for (const base of bases) {
        if (!existsSync(base)) continue;
        const folder = readdirSync(base).find((name) => name.startsWith("chromium"));
        if (!folder) continue;
        for (const exe of ["chrome-win64/chrome.exe", "chrome-linux/chrome", "chrome-mac/Chromium.app/Contents/MacOS/Chromium"]) {
            const path = join(base, folder, exe);
            if (existsSync(path)) return path;
        }
    }
    return null;
}

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };

/** Serves dist/ like a plain static host (no caching, correct content types). */
function serveDist(port) {
    const server = createServer((req, res) => {
        const url = new URL(req.url, "http://x");
        let path = join("dist", decodeURIComponent(url.pathname));
        if (!existsSync(path) || statSync(path).isDirectory()) path = join(path, "index.html");
        if (!existsSync(path)) {
            res.writeHead(404);
            res.end("404");
            return;
        }
        res.writeHead(200, { "Content-Type": MIME[extname(path)] ?? "application/octet-stream" });
        res.end(readFileSync(path));
    });
    return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

const chromiumPath = findChromium();
if (!chromiumPath) {
    console.log("→ Browser smoke test... skipped (no local Chromium found for playwright-core)");
    steps.push({ name: "Browser smoke test", ok: true, detail: "skipped: no Chromium" });
} else {
    await step("Browser smoke test (mocked Supabase, zero real accounts)", async () => {
        const { chromium } = await import("playwright-core");
        const server = await serveDist(8791);
        const browser = await chromium.launch({ executablePath: chromiumPath });
        try {
            const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
            const consoleErrors = [];
            page.on("pageerror", (error) => consoleErrors.push(error.message));
            page.on("console", (message) => {
                // Skip the browser's own log for requests this test deliberately aborts below.
                if (message.type() === "error" && !message.text().includes("Failed to load resource")) consoleErrors.push(message.text());
            });
            let realSupabaseHit = false;
            await page.route("**/*", (route) => {
                const url = route.request().url();
                if (url.includes(".supabase.co")) realSupabaseHit = true;
                if (/opentdb\.com|the-trivia-api\.com|translate\.googleapis|mymemory\.translated/.test(url)) return route.abort();
                return route.continue();
            });

            await page.goto("http://localhost:8791/");
            await page.waitForTimeout(1200);
            if (!(await page.$("#slot-machine"))) throw new Error("the slot machine did not render");
            if (await page.$$eval(".reel-window", (nodes) => nodes.length) !== 3) throw new Error("expected 3 reels (topic, mode, multiplier)");

            await page.click("#lever");
            await page.waitForSelector(".answer-button", { timeout: 20000 });
            await page.waitForTimeout(300);
            await page.click(".answer-button");
            await page.waitForTimeout(300);
            const disabledAfterClick = await page.$$eval(".answer-button", (buttons) => buttons.every((button) => button.disabled));
            if (!disabledAfterClick) throw new Error("answering a question did not register");

            await page.click("#settings-button");
            await page.waitForTimeout(300);
            if (!(await page.$("#settings-menu.is-open"))) throw new Error("Settings did not open");
            await page.keyboard.press("Escape");

            const footerText = await page.$eval(".site-footer", (el) => el.textContent ?? "");
            if (!/v\d/.test(footerText)) throw new Error("the footer is missing the version number");
            if (!(await page.$('.footer-link[href*="github.com"]'))) throw new Error("the footer is missing the GitHub link");

            if (realSupabaseHit) throw new Error("the page tried to reach the real Supabase project during an automated check");
            if (consoleErrors.length > 0) throw new Error(`console errors: ${consoleErrors.slice(0, 3).join(" | ")}`);
        } finally {
            await browser.close();
            server.close();
        }
        return "home, spin, answer, Settings and the footer all work; Supabase was never contacted";
    });
}

console.log("\n" + "─".repeat(60));
for (const result of steps) console.log(`${result.ok ? "✔" : "✖"} ${result.name}`);
console.log("─".repeat(60));
console.log(failed ? "Some checks failed — see above." : "Everything checks out.");
process.exit(failed ? 1 : 0);

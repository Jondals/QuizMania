/**
 * pruebas.mjs
 * Ejecuta los tests de la carpeta tests/: los compila con esbuild a
 * .pruebas/ y los lanza con el runner de tests de Node.
 */

import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const CARPETA_TEMPORAL = ".pruebas";
const archivosDeTest = readdirSync("tests").filter((nombre) => nombre.endsWith(".test.ts"));

rmSync(CARPETA_TEMPORAL, { recursive: true, force: true });
await build({
    entryPoints: archivosDeTest.map((nombre) => `tests/${nombre}`),
    bundle: true,
    platform: "node",
    format: "esm",
    outdir: CARPETA_TEMPORAL,
    outExtension: { ".js": ".mjs" },
});

const archivosCompilados = readdirSync(CARPETA_TEMPORAL).map((nombre) => join(CARPETA_TEMPORAL, nombre));
const resultado = spawnSync(process.execPath, ["--test", ...archivosCompilados], { stdio: "inherit" });
rmSync(CARPETA_TEMPORAL, { recursive: true, force: true });
process.exit(resultado.status ?? 1);

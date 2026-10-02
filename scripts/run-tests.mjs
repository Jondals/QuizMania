/**
 * run-tests.mjs
 * Runs the tests in the tests/ folder: bundles them with esbuild into
 * .test-build/ and launches them with Node's built-in test runner.
 */

import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const TEMPORARY_DIR = ".test-build";
const testFiles = readdirSync("tests").filter((name) => name.endsWith(".test.ts"));

rmSync(TEMPORARY_DIR, { recursive: true, force: true });
await build({
    entryPoints: testFiles.map((name) => `tests/${name}`),
    bundle: true,
    platform: "node",
    format: "esm",
    outdir: TEMPORARY_DIR,
    outExtension: { ".js": ".mjs" },
});

const bundledFiles = readdirSync(TEMPORARY_DIR).map((name) => join(TEMPORARY_DIR, name));
const result = spawnSync(process.execPath, ["--test", ...bundledFiles], { stdio: "inherit" });
rmSync(TEMPORARY_DIR, { recursive: true, force: true });
process.exit(result.status ?? 1);

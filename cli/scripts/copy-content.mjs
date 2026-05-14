// Copies src/content/ into dist/content/ after tsc runs.
// Charters and skills are .md files — TypeScript does not handle them, so we copy verbatim.
//
// Important: rm dist/content first so renamed / deleted agents and skills don't
// linger in the build output (otherwise `pwagent agents list` shows stale names).

import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const src = resolve(root, "src", "content");
const dst = resolve(root, "dist", "content");

await rm(dst, { recursive: true, force: true });
await mkdir(dst, { recursive: true });
await cp(src, dst, { recursive: true });
console.log(`copied ${src} -> ${dst}`);

// Copies src/content/ into dist/content/ after tsc runs.
// Charters and skills are .md files — TypeScript does not handle them, so we copy verbatim.

import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const src = resolve(root, "src", "content");
const dst = resolve(root, "dist", "content");

await mkdir(dst, { recursive: true });
await cp(src, dst, { recursive: true });
console.log(`copied ${src} -> ${dst}`);

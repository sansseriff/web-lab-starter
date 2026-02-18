import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.join(__dirname, "dist");
const backendWebDir = path.join(__dirname, "..", "app", "web_dist");

await rm(backendWebDir, { recursive: true, force: true });
await mkdir(backendWebDir, { recursive: true });
await cp(distDir, backendWebDir, { recursive: true });

console.log(`Copied ${distDir} -> ${backendWebDir}`);

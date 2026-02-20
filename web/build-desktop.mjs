import { cp, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.join(__dirname, "dist");
const backendWebDir = path.join(__dirname, "..", "app", "web_dist");
const distAssetsDir = path.join(distDir, "assets");
const requiredBokehFiles = [
  "bokeh-3.8.2.min.js",
  "bokeh-gl-3.8.2.min.js",
  "bokeh-widgets-3.8.2.min.js",
  "bokeh-tables-3.8.2.min.js",
  "bokeh-mathjax-3.8.2.min.js",
  "bokeh-api-3.8.2.min.js",
];

const distAssetFiles = await readdir(distAssetsDir);
const missingBokehFiles = requiredBokehFiles.filter(
  (file) => !distAssetFiles.includes(file)
);

if (missingBokehFiles.length > 0) {
  throw new Error(
    [
      "Missing required Bokeh assets in dist/assets:",
      ...missingBokehFiles.map((file) => `- ${file}`),
      "",
      "Add them to web/public/assets so Vite copies them during build.",
    ].join("\n")
  );
}

await rm(backendWebDir, { recursive: true, force: true });
await cp(distDir, backendWebDir, { recursive: true });

console.log(`Copied ${distDir} -> ${backendWebDir}`);
console.log(`Verified Bokeh assets: ${requiredBokehFiles.join(", ")}`);

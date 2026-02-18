import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const webDir = path.join(rootDir, "web");

const rawArgs = process.argv.slice(2);
const showHelp = rawArgs.includes("--help") || rawArgs.includes("-h");
const shouldRebuild = rawArgs.includes("--rebuild") || rawArgs.includes("-r");
const nameParts = rawArgs.filter(
  (arg) => !["--help", "-h", "--rebuild", "-r"].includes(arg)
);
const newName = nameParts.join(" ").trim();

function printUsage(): void {
  console.log('Usage: bun scripts/set-app-name.ts "Your App Name" [--rebuild]');
  console.log("");
  console.log("Options:");
  console.log("  -r, --rebuild   Rebuild and copy frontend after title update");
  console.log("  -h, --help      Show this help message");
}

if (showHelp) {
  printUsage();
  process.exit(0);
}

if (!newName) {
  printUsage();
  process.exit(1);
}

const htmlFiles = [
  path.join(rootDir, "web", "index.html"),
  path.join(rootDir, "web", "dist", "index.html"),
  path.join(rootDir, "app", "web_dist", "index.html"),
];

const pythonMainFile = path.join(rootDir, "app", "main.py");

function updateHtmlTitle(content: string, appName: string): string {
  const titlePattern = /<title>[\s\S]*?<\/title>/i;
  if (!titlePattern.test(content)) {
    throw new Error("No <title> tag found.");
  }
  return content.replace(titlePattern, `<title>${appName}</title>`);
}

function updatePythonAppName(content: string, appName: string): string {
  const appNamePattern = /^APP_NAME\s*=\s*["'][^"']*["']\s*$/m;
  if (!appNamePattern.test(content)) {
    throw new Error("No APP_NAME constant found in app/main.py.");
  }
  return content.replace(appNamePattern, `APP_NAME = ${JSON.stringify(appName)}`);
}

async function updateIfExists(
  filePath: string,
  updater: (content: string, appName: string) => string
): Promise<boolean> {
  try {
    const current = await readFile(filePath, "utf8");
    const next = updater(current, newName);
    if (current !== next) {
      await writeFile(filePath, next, "utf8");
      return true;
    }
    return false;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("ENOENT")) {
      return false;
    }
    throw error;
  }
}

async function run(): Promise<void> {
  const updated: string[] = [];
  const skipped: string[] = [];

  if (await updateIfExists(pythonMainFile, updatePythonAppName)) {
    updated.push(path.relative(rootDir, pythonMainFile));
  } else {
    skipped.push(path.relative(rootDir, pythonMainFile));
  }

  for (const htmlFile of htmlFiles) {
    if (await updateIfExists(htmlFile, updateHtmlTitle)) {
      updated.push(path.relative(rootDir, htmlFile));
    } else {
      skipped.push(path.relative(rootDir, htmlFile));
    }
  }

  if (updated.length) {
    console.log(`Updated app name to "${newName}" in:`);
    for (const file of updated) {
      console.log(`- ${file}`);
    }
  } else {
    console.log(`No changes needed for "${newName}".`);
  }

  if (skipped.length) {
    console.log("Skipped (missing or unchanged):");
    for (const file of skipped) {
      console.log(`- ${file}`);
    }
  }

  if (shouldRebuild) {
    console.log("Rebuilding frontend with updated app name...");
    await rebuildFrontend();
    console.log("Frontend rebuild complete.");
  }
}

function rebuildFrontend(): Promise<void> {
  return new Promise((resolve, reject) => {
    const bunBinary = process.platform === "win32" ? "bun.cmd" : "bun";
    const child = spawn(bunBinary, ["run", "build:desktop"], {
      cwd: webDir,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Rebuild failed with exit code ${code ?? "unknown"}`));
      }
    });
  });
}

void run();

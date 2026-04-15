import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

const workspaceRoots = ["apps", "packages"];
const scriptName = process.argv[2];

if (!scriptName) {
  console.error("Usage: node scripts/run-workspaces.mjs <script>");
  process.exit(1);
}

async function discoverWorkspaces() {
  const cwd = process.cwd();
  const workspaces = [];

  for (const root of workspaceRoots) {
    const rootPath = path.join(cwd, root);
    let entries = [];

    try {
      entries = await readdir(rootPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const packageJsonPath = path.join(rootPath, entry.name, "package.json");

      try {
        const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
        workspaces.push(packageJson.name);
      } catch {
        continue;
      }
    }
  }

  return workspaces;
}

const workspaces = await discoverWorkspaces();
let failures = 0;

for (const workspace of workspaces) {
  const child = spawn("npm", ["run", scriptName, "--workspace", workspace], {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  const exitCode = await new Promise((resolve) => {
    child.on("exit", resolve);
  });

  if (exitCode !== 0) {
    failures += 1;
  }
}

process.exit(failures === 0 ? 0 : 1);
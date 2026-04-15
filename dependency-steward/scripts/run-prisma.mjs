import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, "..");
const schemaPath = path.join(repoRoot, "packages", "db", "prisma", "schema.prisma");
const envPath = path.join(repoRoot, ".env");

const command = process.argv[2];
const extraArgs = process.argv.slice(3);

if (!command) {
  console.error("Usage: node scripts/run-prisma.mjs <generate|migrate|studio|seed> [...args]");
  process.exit(1);
}

function parseEnvFile(content) {
  const values = {};

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const normalized = line.startsWith("export ") ? line.slice(7) : line;
    const separatorIndex = normalized.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = normalized.slice(0, separatorIndex).trim();
    let value = normalized.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

async function loadRepoEnv() {
  try {
    const content = await readFile(envPath, "utf8");
    return parseEnvFile(content);
  } catch {
    return {};
  }
}

function resolveExecutable(name) {
  return path.join(repoRoot, "node_modules", ".bin", process.platform === "win32" ? `${name}.cmd` : name);
}

function buildLocalDatabaseUrl(env) {
  const rawPort = env.POSTGRES_HOST_PORT;
  const parsedPort = Number(rawPort);
  const postgresHostPort = Number.isFinite(parsedPort) ? parsedPort : 5433;
  return `postgresql://postgres:postgres@127.0.0.1:${postgresHostPort}/dependency_steward`;
}

function runCommand(executable, args, env) {
  const child = spawn(executable, args, {
    cwd: repoRoot,
    env: {
      ...env,
      ...process.env
    },
    stdio: "inherit",
    shell: false
  });

  child.on("exit", (code) => {
    process.exit(code ?? 1);
  });

  child.on("error", (error) => {
    console.error(error);
    process.exit(1);
  });
}

const repoEnv = await loadRepoEnv();
const effectiveEnv = {
  ...repoEnv,
  ...process.env
};

if (!process.env.DATABASE_URL) {
  effectiveEnv.DATABASE_URL = process.env.POSTGRES_HOST_PORT
    ? buildLocalDatabaseUrl(effectiveEnv)
    : repoEnv.DATABASE_URL ?? buildLocalDatabaseUrl(effectiveEnv);
}

switch (command) {
  case "generate":
    runCommand(resolveExecutable("prisma"), ["generate", "--schema", schemaPath, ...extraArgs], effectiveEnv);
    break;
  case "migrate":
    runCommand(
      resolveExecutable("prisma"),
      ["migrate", "dev", "--schema", schemaPath, ...extraArgs],
      effectiveEnv
    );
    break;
  case "studio":
    runCommand(resolveExecutable("prisma"), ["studio", "--schema", schemaPath, ...extraArgs], effectiveEnv);
    break;
  case "seed":
    runCommand(resolveExecutable("tsx"), [path.join("packages", "db", "prisma", "seed.ts"), ...extraArgs], effectiveEnv);
    break;
  default:
    console.error(`Unsupported Prisma command: ${command}`);
    process.exit(1);
}
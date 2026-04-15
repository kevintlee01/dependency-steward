import process from "node:process";
import { spawn } from "node:child_process";

const commands = [
  ["web", ["run", "dev:web"]],
  ["api", ["run", "dev:api"]],
  ["worker", ["run", "dev:worker"]]
];

const children = commands.map(([label, args], index) => {
  const child = spawn("npm", args, {
    cwd: process.cwd(),
    stdio: ["inherit", "pipe", "pipe"],
    shell: process.platform === "win32"
  });

  const prefix = `[${label}] `;
  const color = [36, 32, 35][index % 3];

  child.stdout.on("data", (chunk) => {
    process.stdout.write(`\u001b[${color}m${prefix}\u001b[0m${chunk}`);
  });

  child.stderr.on("data", (chunk) => {
    process.stderr.write(`\u001b[${color}m${prefix}\u001b[0m${chunk}`);
  });

  return child;
});

function shutdown(signal) {
  for (const child of children) {
    child.kill(signal);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

const exitCode = await new Promise((resolve) => {
  let remaining = children.length;

  for (const child of children) {
    child.on("exit", (code) => {
      remaining -= 1;

      if (remaining === 0) {
        resolve(code ?? 0);
      }
    });
  }
});

process.exit(exitCode);
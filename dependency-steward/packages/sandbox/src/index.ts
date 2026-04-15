import { cp, mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import type { VerificationReport } from "@dependency-steward/shared";

export interface SandboxPaths {
  rootDir: string;
  repoDir: string;
  artifactsDir: string;
  cacheDir: string;
  metaDir: string;
}

export interface RunCommandOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  lifecycleScriptsEnabled?: boolean;
}

const allowedExecutables = new Set(["git", "npm", "pnpm", "node"]);

function assertAllowed(command: string, args: string[], lifecycleScriptsEnabled: boolean): void {
  if (!allowedExecutables.has(command)) {
    throw new Error(`Command not allowed in sandbox: ${command}`);
  }

  const isInstallCommand =
    (command === "npm" && (args[0] === "install" || args[0] === "ci" || args[0] === "update")) ||
    (command === "pnpm" && args[0] === "install");

  if (isInstallCommand && !lifecycleScriptsEnabled && !args.includes("--ignore-scripts")) {
    throw new Error("Install commands must include --ignore-scripts unless lifecycle scripts are explicitly enabled.");
  }
}

export class SandboxRunner {
  async createWorkspace(prefix = "dependency-steward-"): Promise<SandboxPaths> {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), prefix));
    const repoDir = path.join(rootDir, "repo");
    const artifactsDir = path.join(rootDir, "artifacts");
    const cacheDir = path.join(rootDir, "cache");
    const metaDir = path.join(rootDir, "meta");

    await Promise.all([mkdir(repoDir), mkdir(artifactsDir), mkdir(cacheDir), mkdir(metaDir)]);

    return {
      rootDir,
      repoDir,
      artifactsDir,
      cacheDir,
      metaDir
    };
  }

  async cleanupWorkspace(paths: SandboxPaths): Promise<void> {
    await rm(paths.rootDir, { recursive: true, force: true });
  }

  async cloneRepository(input: {
    repoUrl: string;
    targetDir: string;
    ref?: string;
    authToken?: string;
  }): Promise<void> {
    const repoUrl = input.authToken
      ? input.repoUrl.replace("https://", `https://x-access-token:${input.authToken}@`)
      : input.repoUrl;

    const args = ["clone", "--depth", "1"];
    if (input.ref) {
      args.push("--branch", input.ref);
    }
    args.push(repoUrl, input.targetDir);

    await this.run("git", args, { cwd: path.dirname(input.targetDir), lifecycleScriptsEnabled: false });
  }

  async hydrateLocalRepository(sourceDir: string, targetDir: string): Promise<void> {
    await cp(sourceDir, targetDir, {
      recursive: true,
      force: true,
      errorOnExist: false
    });
  }

  async run(command: string, args: string[], options: RunCommandOptions = {}): Promise<VerificationReport> {
    const start = Date.now();
    assertAllowed(command, args, options.lifecycleScriptsEnabled ?? false);

    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        env: {
          ...process.env,
          ...options.env
        },
        shell: false
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", reject);

      child.on("exit", (code) => {
        resolve({
          command: [command, ...args].join(" "),
          success: code === 0,
          exitCode: code ?? 1,
          stdout,
          stderr,
          durationMs: Date.now() - start
        });
      });
    });
  }
}
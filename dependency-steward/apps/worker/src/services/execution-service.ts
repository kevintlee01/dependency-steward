import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadRuntimeEnv } from "@dependency-steward/config";
import { prisma } from "@dependency-steward/db";
import {
  evaluateImpactedCoverage,
  loadCoverageFromArtifacts,
  rankTestTargets
} from "@dependency-steward/coverage-intelligence";
import {
  buildDependencyCandidates,
  detectPackageManager,
  inferTestFramework
} from "@dependency-steward/dependency-intelligence";
import {
  createPullRequest,
  createInstallationTokenClient,
  createTokenClient,
  type InstallationClientConfig
} from "@dependency-steward/github";
import { SandboxRunner } from "@dependency-steward/sandbox";
import type {
  FollowUpJobPayload,
  ScanJobPayload,
  TestBackfillJobPayload,
  UpgradeJobPayload
} from "@dependency-steward/queue";
import {
  type CoverageSnapshotRecord,
  type DependencyCandidate,
  type PolicyRecord,
  type RepositoryRecord,
  type RunRecord,
  createId,
  nowIso
} from "@dependency-steward/shared";
import { DependencyStewardOrchestrator } from "@dependency-steward/agent-core";

const env = loadRuntimeEnv();

function splitCommand(command: string): [string, string[]] {
  const tokens = command.split(" ").filter(Boolean);
  return [tokens[0] ?? "", tokens.slice(1)];
}

function preserveVersionPrefix(currentVersion: string, targetVersion: string): string {
  const prefix = currentVersion.match(/^[\^~]/)?.[0] ?? "";
  return `${prefix}${targetVersion}`;
}

function stripCodeFences(value: string): string {
  const fenced = value.match(/```[a-z]*\s*([\s\S]+?)```/i);
  return fenced ? fenced[1].trim() : value.trim();
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export class ExecutionService {
  private readonly sandbox = new SandboxRunner();
  private readonly orchestrator = new DependencyStewardOrchestrator();

  private async loadRepository(repositoryId: string): Promise<{ repository: RepositoryRecord; policy: PolicyRecord | null }> {
    const repository = await prisma.repository.findUnique({
      where: { id: repositoryId },
      include: { policies: { orderBy: { updatedAt: "desc" }, take: 1 } }
    });

    if (!repository) {
      throw new Error(`Repository not found: ${repositoryId}`);
    }

    const policy = repository.policies[0]
      ? ({
          id: repository.policies[0].id,
          repositoryId: repository.policies[0].repositoryId,
          minRepoCoverage: repository.policies[0].minRepoCoverage,
          minImpactedCoverage: repository.policies[0].minImpactedCoverage,
          allowedUpgradeKinds: repository.policies[0].allowedUpgradeKinds as PolicyRecord["allowedUpgradeKinds"],
          securityOverrideEnabled: repository.policies[0].securityOverrideEnabled,
          autoCreatePrs: repository.policies[0].autoCreatePrs,
          testBackfillEnabled: repository.policies[0].testBackfillEnabled,
          maxRepairAttempts: repository.policies[0].maxRepairAttempts,
          requiredPassingTestRuns: repository.policies[0].requiredPassingTestRuns,
          coverageSourcePreference: repository.policies[0].coverageSourcePreference,
          coverageWorkflowName: repository.policies[0].coverageWorkflowName,
          coverageArtifactName: repository.policies[0].coverageArtifactName,
          lifecycleScriptsPolicy: repository.policies[0].lifecycleScriptsPolicy,
          verificationCommands: repository.policies[0].verificationCommands as string[],
          coverageAlertThreshold: repository.policies[0].coverageAlertThreshold,
          createdAt: repository.policies[0].createdAt.toISOString(),
          updatedAt: repository.policies[0].updatedAt.toISOString()
        } satisfies PolicyRecord)
      : null;

    return {
      repository: {
        id: repository.id,
        installationId: repository.installationId,
        owner: repository.owner,
        name: repository.name,
        fullName: repository.fullName,
        repoUrl: repository.repoUrl,
        localPath: repository.localPath,
        defaultBranch: repository.defaultBranch,
        packageManager: repository.packageManager,
        testFramework: repository.testFramework,
        onboardingState: repository.onboardingState,
        healthStatus: repository.healthStatus,
        activePolicyId: repository.activePolicyId,
        lastScanAt: repository.lastScanAt?.toISOString() ?? null,
        createdAt: repository.createdAt.toISOString(),
        updatedAt: repository.updatedAt.toISOString()
      },
      policy
    };
  }

  private async updateRun(
    runId: string,
    data: {
      status?: RunRecord["status"];
      summary?: string;
      failureCategory?: string | null;
      blockingReason?: string | null;
      endedAt?: Date | null;
      baseSha?: string | null;
    }
  ) {
    await prisma.run.update({
      where: { id: runId },
      data
    });
  }

  private async withStep<T>(
    runId: string,
    stepKey: string,
    inputJson: Record<string, unknown> | null,
    work: () => Promise<T>
  ): Promise<T> {
    const step = await prisma.runStep.create({
      data: {
        runId,
        stepKey,
        status: "in_progress",
        startedAt: new Date(),
        inputJson
      }
    });

    try {
      const result = await work();
      await prisma.runStep.update({
        where: { id: step.id },
        data: {
          status: "succeeded",
          endedAt: new Date(),
          outputJson:
            result && typeof result === "object"
              ? (result as Record<string, unknown>)
              : { result: String(result ?? "") }
        }
      });
      return result;
    } catch (error) {
      await prisma.runStep.update({
        where: { id: step.id },
        data: {
          status: "failed",
          endedAt: new Date(),
          errorCode: error instanceof Error ? error.message : "unknown_error"
        }
      });
      throw error;
    }
  }

  private async writeArtifact(runId: string, artifactType: string, fileName: string, content: string) {
    const runDir = path.join(env.artifactStorageRoot, runId);
    await mkdir(runDir, { recursive: true });
    const storageKey = path.join(runDir, fileName);
    await writeFile(storageKey, content, "utf8");

    return prisma.artifact.create({
      data: {
        runId,
        artifactType: artifactType as any,
        storageKey,
        contentType: "text/plain",
        byteSize: Buffer.byteLength(content)
      }
    });
  }

  private async getInstallationConfig(repository: RepositoryRecord): Promise<InstallationClientConfig | null> {
    if (!repository.installationId || !env.githubAppId || !env.githubAppPrivateKey) {
      return null;
    }

    return {
      appId: env.githubAppId,
      privateKey: env.githubAppPrivateKey,
      installationId: repository.installationId
    };
  }

  private async prepareWorkspace(repository: RepositoryRecord) {
    const workspace = await this.sandbox.createWorkspace();
    let installation: { token: string } | null = null;

    if (repository.localPath) {
      await this.sandbox.hydrateLocalRepository(repository.localPath, workspace.repoDir);
    } else if (repository.repoUrl) {
      const installationConfig = await this.getInstallationConfig(repository);
      if (installationConfig) {
        const installationClient = await createInstallationTokenClient(installationConfig);
        installation = { token: installationClient.token };
      }

      await this.sandbox.cloneRepository({
        repoUrl: repository.repoUrl,
        targetDir: workspace.repoDir,
        ref: repository.defaultBranch,
        authToken: installation?.token ?? env.githubPat
      });
    } else {
      throw new Error("Repository has neither a local path nor a cloneable repo URL.");
    }

    return {
      workspace,
      installation
    };
  }

  private async resolveBaseSha(repoDir: string): Promise<string> {
    const report = await this.sandbox.run("git", ["rev-parse", "HEAD"], {
      cwd: repoDir,
      lifecycleScriptsEnabled: false
    });

    return report.success ? report.stdout.trim() : `local-${Date.now()}`;
  }

  private async persistCoverageSnapshot(repositoryId: string, snapshot: CoverageSnapshotRecord) {
    await prisma.coverageSnapshot.create({
      data: {
        id: snapshot.id,
        repositoryId,
        commitSha: snapshot.commitSha,
        generatedAt: new Date(snapshot.generatedAt),
        linePct: snapshot.linePct,
        branchPct: snapshot.branchPct,
        functionPct: snapshot.functionPct,
        statementPct: snapshot.statementPct,
        artifactId: snapshot.artifactId,
        fileMetrics: {
          create: snapshot.fileMetrics.map((metric) => ({
            id: metric.id,
            filePath: metric.filePath,
            linePct: metric.linePct,
            branchPct: metric.branchPct,
            functionPct: metric.functionPct,
            statementPct: metric.statementPct,
            uncoveredLines: metric.uncoveredLines,
            uncoveredBranches: metric.uncoveredBranches
          }))
        }
      }
    });
  }

  private async createQueuedRun(input: {
    repositoryId: string;
    dependencyCandidateId?: string;
    runType: RunRecord["runType"];
    triggerSource: RunRecord["triggerSource"];
    summary: string;
    resumedFromDeferredUpgradeId?: string;
  }) {
    const repository = await prisma.repository.findUnique({ where: { id: input.repositoryId } });
    if (!repository) {
      throw new Error(`Repository not found: ${input.repositoryId}`);
    }

    return prisma.run.create({
      data: {
        repositoryId: repository.id,
        dependencyCandidateId: input.dependencyCandidateId,
        runType: input.runType,
        triggerSource: input.triggerSource,
        status: "queued",
        baseBranch: repository.defaultBranch,
        policyVersion: repository.activePolicyId,
        correlationId: createId(),
        summary: input.summary,
        resumedFromDeferredUpgradeId: input.resumedFromDeferredUpgradeId
      }
    });
  }

  private async updateManifestDependency(repoDir: string, candidate: DependencyCandidate) {
    const manifestPath = path.join(repoDir, "package.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, any>;

    for (const dependencyField of ["dependencies", "devDependencies", "peerDependencies"] as const) {
      if (manifest[dependencyField]?.[candidate.packageName]) {
        manifest[dependencyField][candidate.packageName] = preserveVersionPrefix(
          manifest[dependencyField][candidate.packageName],
          candidate.targetVersion
        );
      }
    }

    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }

  private async runVerification(repoDir: string, policy: PolicyRecord, packageManager: RepositoryRecord["packageManager"]) {
    if (policy.verificationCommands.length > 0) {
      const reports = [];
      for (const command of policy.verificationCommands) {
        const [executable, args] = splitCommand(command);
        reports.push(
          await this.sandbox.run(executable, args, {
            cwd: repoDir,
            lifecycleScriptsEnabled: false
          })
        );
      }
      return reports;
    }

    const manifest = JSON.parse(await readFile(path.join(repoDir, "package.json"), "utf8")) as { scripts?: Record<string, string> };
    const scripts = manifest.scripts ?? {};
    const run = packageManager === "pnpm" ? "pnpm" : "npm";

    if (scripts.test) {
      return [await this.sandbox.run(run, ["test"], { cwd: repoDir, lifecycleScriptsEnabled: false })];
    }

    if (scripts.build) {
      return [await this.sandbox.run(run, ["run", "build"], { cwd: repoDir, lifecycleScriptsEnabled: false })];
    }

    return [{ command: "no-op", success: true, stdout: "No test or build script found — verification skipped.", stderr: "", exitCode: 0 }];
  }

  private async installDependencies(repoDir: string, packageManager: RepositoryRecord["packageManager"]) {
    if (packageManager === "pnpm") {
      return this.sandbox.run("pnpm", ["install", "--ignore-scripts"], {
        cwd: repoDir,
        lifecycleScriptsEnabled: false
      });
    }

    return this.sandbox.run("npm", ["install", "--ignore-scripts"], {
      cwd: repoDir,
      lifecycleScriptsEnabled: false
    });
  }

  private async createPatchArtifact(runId: string, repoDir: string) {
    const diff = await this.sandbox.run("git", ["diff"], {
      cwd: repoDir,
      lifecycleScriptsEnabled: false
    });

    return this.writeArtifact(runId, "patch", "changes.patch", diff.stdout || diff.stderr);
  }

  private async commitAndPushChanges(input: {
    repo: RepositoryRecord;
    repoDir: string;
    branchName: string;
    commitMessage: string;
    token?: string;
  }) {
    await this.sandbox.run("git", ["config", "user.name", "Dependency Steward"], {
      cwd: input.repoDir,
      lifecycleScriptsEnabled: false
    });
    await this.sandbox.run("git", ["config", "user.email", "bot@dependency-steward.local"], {
      cwd: input.repoDir,
      lifecycleScriptsEnabled: false
    });
    await this.sandbox.run("git", ["checkout", "-B", input.branchName], {
      cwd: input.repoDir,
      lifecycleScriptsEnabled: false
    });
    await this.sandbox.run("git", ["add", "."], {
      cwd: input.repoDir,
      lifecycleScriptsEnabled: false
    });
    await this.sandbox.run("git", ["commit", "-m", input.commitMessage], {
      cwd: input.repoDir,
      lifecycleScriptsEnabled: false
    });

    if (input.repo.repoUrl) {
      const pushToken = input.token ?? env.githubPat;
      if (pushToken) {
        const repoUrlWithAuth = input.repo.repoUrl.replace("https://", `https://x-access-token:${pushToken}@`);
        await this.sandbox.run("git", ["remote", "set-url", "origin", repoUrlWithAuth], {
          cwd: input.repoDir,
          lifecycleScriptsEnabled: false
        });
        await this.sandbox.run("git", ["push", "origin", input.branchName, "--force-with-lease"], {
          cwd: input.repoDir,
          lifecycleScriptsEnabled: false
        });
      }
    }
  }

  private async createPullRequestRecord(input: {
    runId: string;
    repository: RepositoryRecord;
    branchName: string;
    title: string;
    body: string;
    labels: string[];
    token?: string;
  }) {
    const token = input.token ?? env.githubPat;

    if (input.repository.repoUrl && token) {
      let client: Awaited<ReturnType<typeof createInstallationTokenClient>>["client"];

      if (input.repository.installationId && env.githubAppId && env.githubAppPrivateKey && input.token) {
        const ic = await createInstallationTokenClient({
          appId: env.githubAppId,
          privateKey: env.githubAppPrivateKey,
          installationId: input.repository.installationId
        });
        client = ic.client;
      } else {
        client = createTokenClient(token);
      }

      const pullRequest = await createPullRequest({
        client,
        owner: input.repository.owner,
        repo: input.repository.name,
        title: input.title,
        body: input.body,
        head: input.branchName,
        base: input.repository.defaultBranch,
        labels: input.labels
      });

      return prisma.pullRequestRecord.create({
        data: {
          repositoryId: input.repository.id,
          runId: input.runId,
          githubPrNumber: pullRequest.number,
          title: input.title,
          url: pullRequest.url,
          branchName: input.branchName,
          prType: input.labels.includes("test-backfill") ? "test_backfill" : "dependency_upgrade",
          status: "open"
        }
      });
    }

    return prisma.pullRequestRecord.create({
      data: {
        repositoryId: input.repository.id,
        runId: input.runId,
        title: input.title,
        url: null,
        branchName: input.branchName,
        prType: input.labels.includes("test-backfill") ? "test_backfill" : "dependency_upgrade",
        status: "draft"
      }
    });
  }

  async processScanJob(payload: ScanJobPayload) {
    let workspaceRef: Awaited<ReturnType<ExecutionService["prepareWorkspace"]>> | null = null;

    try {
      await this.updateRun(payload.runId, { status: "preparing" });
      const { repository, policy } = await this.loadRepository(payload.repositoryId);
      if (!policy) {
        throw new Error("Repository has no active policy.");
      }

      workspaceRef = await this.withStep(payload.runId, "prepare_workspace", null, async () =>
        this.prepareWorkspace(repository)
      );
      const repoDir = workspaceRef.workspace.repoDir;
      const baseSha = await this.resolveBaseSha(repoDir);

      await this.updateRun(payload.runId, {
        status: "running",
        baseSha,
        summary: "Scanning repository dependencies and coverage posture."
      });

      const packageManager = await this.withStep(payload.runId, "detect_package_manager", null, async () =>
        detectPackageManager(repoDir)
      );
      const testFramework = await this.withStep(payload.runId, "detect_test_framework", null, async () =>
        inferTestFramework(repoDir)
      );

      await prisma.repository.update({
        where: { id: repository.id },
        data: {
          packageManager,
          testFramework,
          lastScanAt: new Date(),
          onboardingState: "active"
        }
      });

      const snapshotId = createId();
      await prisma.dependencySnapshot.create({
        data: {
          id: snapshotId,
          repositoryId: repository.id,
          commitSha: baseSha,
          manifestPath: path.join(repoDir, "package.json"),
          lockfilePath:
            packageManager === "pnpm"
              ? path.join(repoDir, "pnpm-lock.yaml")
              : path.join(repoDir, "package-lock.json"),
          packageManager
        }
      });

      const lcovPath = path.join(repoDir, "coverage", "lcov.info");
      const summaryJsonPath = path.join(repoDir, "coverage", "coverage-summary.json");
      const coverageSnapshot = await this.withStep(payload.runId, "load_coverage", null, async () =>
        loadCoverageFromArtifacts({
          repositoryId: repository.id,
          commitSha: baseSha,
          lcovPath: (await fileExists(lcovPath)) ? lcovPath : undefined,
          summaryJsonPath: (await fileExists(summaryJsonPath)) ? summaryJsonPath : undefined
        })
      );

      if (coverageSnapshot) {
        await this.persistCoverageSnapshot(repository.id, coverageSnapshot);
      }

      const candidates = await this.withStep(payload.runId, "analyze_dependencies", null, async () =>
        buildDependencyCandidates({
          rootDir: repoDir,
          snapshotId,
          impactedCoverage: coverageSnapshot?.linePct ?? null
        })
      );

      for (const candidate of candidates) {
        await prisma.dependencyCandidate.create({
          data: {
            id: candidate.id,
            snapshotId: candidate.snapshotId,
            packageName: candidate.packageName,
            currentVersion: candidate.currentVersion,
            targetVersion: candidate.targetVersion,
            kind: candidate.kind,
            directness: candidate.directness,
            advisorySeverity: candidate.advisorySeverity,
            riskScore: candidate.riskScore,
            riskTier: candidate.riskTier,
            recommendedAction: candidate.recommendedAction,
            changelogSummary: candidate.changelogSummary,
            status: candidate.status,
            rationale: candidate.rationale,
            breakingSignals: candidate.breakingSignals
          }
        });
      }

      if (candidates.length === 0) {
        await this.updateRun(payload.runId, {
          status: "succeeded",
          summary: "No outdated or vulnerable dependencies were detected.",
          endedAt: new Date()
        });
        return;
      }

      const primaryCandidate = candidates[0];
      const impacted = coverageSnapshot
        ? await this.withStep(payload.runId, "map_impacted_coverage", null, async () =>
            evaluateImpactedCoverage(repoDir, primaryCandidate.packageName, coverageSnapshot.fileMetrics)
          )
        : { impactedCoverage: null, impactedFiles: [], confidence: "low" as const };

      const decision = this.orchestrator.routeCandidate({
        repository,
        policy,
        candidate: primaryCandidate,

        repositorySupported: packageManager !== "unknown",
        coverageAvailable: Boolean(coverageSnapshot),
        repositoryCoverage: coverageSnapshot?.linePct ?? null,
        impactedCoverage: impacted.impactedCoverage,
        impactedMappingConfidence: impacted.confidence
      });

      if (decision.action === "manual-review") {
        await this.updateRun(payload.runId, {
          status: "awaiting_manual_review",
          blockingReason: decision.manualReview?.message ?? decision.reason,
          failureCategory: decision.manualReview?.reasonCode ?? "manual_review",
          summary: decision.reason,
          endedAt: new Date()
        });
        return;
      }

      if (decision.action === "tests-first") {
        const followOnRun = await this.createQueuedRun({
          repositoryId: repository.id,
          dependencyCandidateId: primaryCandidate.id,
          runType: "test_backfill",
          triggerSource: "follow_up",
          summary: `Tests-first route for ${primaryCandidate.packageName}`
        });

        await prisma.run.update({
          where: { id: payload.runId },
          data: {
            status: "succeeded",
            summary: `Coverage gating deferred ${primaryCandidate.packageName} to a test-backfill run.`,
            endedAt: new Date(),
            dependencyCandidateId: primaryCandidate.id
          }
        });

        await this.processTestBackfillJob({
          runId: followOnRun.id,
          repositoryId: repository.id,
          candidateId: primaryCandidate.id,
          correlationId: followOnRun.correlationId
        });
        return;
      }

      const followOnRun = await this.createQueuedRun({
        repositoryId: repository.id,
        dependencyCandidateId: primaryCandidate.id,
        runType: "upgrade",
        triggerSource: "follow_up",
        summary: `Upgrade ${primaryCandidate.packageName} to ${primaryCandidate.targetVersion}`
      });

      await this.updateRun(payload.runId, {
        status: "succeeded",
        summary: `Upgrade run queued for ${primaryCandidate.packageName}.`,
        endedAt: new Date()
      });

      await this.processUpgradeJob({
        runId: followOnRun.id,
        repositoryId: repository.id,
        candidateId: primaryCandidate.id,
        correlationId: followOnRun.correlationId
      });
    } catch (error) {
      await this.updateRun(payload.runId, {
        status: "failed",
        failureCategory: "scan_failed",
        blockingReason: error instanceof Error ? error.message : "Scan job failed.",
        endedAt: new Date()
      });
    } finally {
      if (workspaceRef) {
        await this.sandbox.cleanupWorkspace(workspaceRef.workspace);
      }
    }
  }

  async processUpgradeJob(payload: UpgradeJobPayload) {
    let workspaceRef: Awaited<ReturnType<ExecutionService["prepareWorkspace"]>> | null = null;

    try {
      await this.updateRun(payload.runId, { status: "preparing" });
      const { repository, policy } = await this.loadRepository(payload.repositoryId);
      if (!policy) {
        throw new Error("Repository has no active policy.");
      }

      const candidateRecord = await prisma.dependencyCandidate.findUnique({ where: { id: payload.candidateId } });
      if (!candidateRecord) {
        throw new Error(`Dependency candidate not found: ${payload.candidateId}`);
      }

      const candidate = candidateRecord as unknown as DependencyCandidate;
      workspaceRef = await this.prepareWorkspace(repository);
      const repoDir = workspaceRef.workspace.repoDir;
      const baseSha = await this.resolveBaseSha(repoDir);
      const branchName = this.orchestrator.buildBranchName(candidate, "upgrade", payload.runId);

      await this.updateRun(payload.runId, {
        status: "running",
        summary: `Applying dependency upgrade for ${candidate.packageName}.`,
        baseSha
      });

      await this.withStep(payload.runId, "apply_version_bump", null, async () => {
        await this.updateManifestDependency(repoDir, candidate);
        return { branchName };
      });

      await this.withStep(payload.runId, "install_dependencies", null, async () =>
        this.installDependencies(repoDir, repository.packageManager)
      );

      const verificationReports = await this.withStep(payload.runId, "verify_workspace", null, async () =>
        this.runVerification(repoDir, policy, repository.packageManager)
      );

      if (verificationReports.some((report) => !report.success)) {
        await this.writeArtifact(payload.runId, "summary", "verification.log", JSON.stringify(verificationReports, null, 2));
        await this.updateRun(payload.runId, {
          status: "awaiting_manual_review",
          blockingReason: "Verification failed after the dependency upgrade.",
          failureCategory: "verification_failed",
          summary: `Verification failed for ${candidate.packageName}.`,
          endedAt: new Date()
        });
        return;
      }

      const composition = await this.orchestrator.composePullRequest({
        repository,
        policy,
        candidate,
        verificationSummary: verificationReports.map((report) => `${report.command}: ${report.success ? "ok" : "failed"}`).join("\n")
      });

      await this.createPatchArtifact(payload.runId, repoDir);
      await this.commitAndPushChanges({
        repo: repository,
        repoDir,
        branchName,
        commitMessage: composition.title,
        token: workspaceRef.installation?.token
      });

      await this.createPullRequestRecord({
        runId: payload.runId,
        repository,
        branchName,
        title: composition.title,
        body: [
          composition.summary,
          "",
          ...composition.bulletPoints.map((point) => `- ${point}`),
          "",
          `Reviewer focus: ${composition.reviewerFocus.join(" ")}`
        ].join("\n"),
        labels: ["ds-generated", "dependency-upgrade", `risk-${candidate.riskTier}`],
        token: workspaceRef.installation?.token
      });

      await prisma.evaluationRecord.upsert({
        where: { runId: payload.runId },
        create: {
          runId: payload.runId,
          coverageDelta: 0,
          passedVerification: true,
          flakeDetected: false,
          generatedFilesCount: 0,
          acceptedByHuman: false
        },
        update: {
          passedVerification: true,
          flakeDetected: false
        }
      });

      if (payload.deferredUpgradeId) {
        await prisma.deferredUpgrade.update({
          where: { id: payload.deferredUpgradeId },
          data: {
            status: "resolved",
            resolvedAt: new Date(),
            effectiveBaseSha: baseSha
          }
        });
      }

      await prisma.dependencyCandidate.update({
        where: { id: payload.candidateId },
        data: { status: "completed" }
      });

      await this.updateRun(payload.runId, {
        status: "succeeded",
        summary: composition.summary,
        endedAt: new Date()
      });
    } catch (error) {
      await this.updateRun(payload.runId, {
        status: "failed",
        failureCategory: "upgrade_failed",
        blockingReason: error instanceof Error ? error.message : "Upgrade job failed.",
        endedAt: new Date()
      });
    } finally {
      if (workspaceRef) {
        await this.sandbox.cleanupWorkspace(workspaceRef.workspace);
      }
    }
  }

  async processTestBackfillJob(payload: TestBackfillJobPayload) {
    let workspaceRef: Awaited<ReturnType<ExecutionService["prepareWorkspace"]>> | null = null;

    try {
      await this.updateRun(payload.runId, { status: "preparing" });
      const { repository, policy } = await this.loadRepository(payload.repositoryId);
      if (!policy) {
        throw new Error("Repository has no active policy.");
      }

      const candidateRecord = await prisma.dependencyCandidate.findUnique({ where: { id: payload.candidateId } });
      if (!candidateRecord) {
        throw new Error(`Dependency candidate not found: ${payload.candidateId}`);
      }

      const latestCoverage = await prisma.coverageSnapshot.findFirst({
        where: { repositoryId: repository.id },
        orderBy: { generatedAt: "desc" },
        include: { fileMetrics: true }
      });

      if (!latestCoverage) {
        await this.updateRun(payload.runId, {
          status: "awaiting_manual_review",
          failureCategory: "coverage_missing",
          blockingReason: "Coverage baseline is required before test generation can proceed.",
          endedAt: new Date()
        });
        return;
      }

      if (!env.openAiApiKey) {
        await this.updateRun(payload.runId, {
          status: "awaiting_manual_review",
          failureCategory: "llm_not_configured",
          blockingReason: "GPT-5.4 credentials are required for automated test generation.",
          endedAt: new Date()
        });
        return;
      }

      workspaceRef = await this.prepareWorkspace(repository);
      const repoDir = workspaceRef.workspace.repoDir;
      const candidate = candidateRecord as unknown as DependencyCandidate;
      const lowCoverageMetrics = rankTestTargets(
        latestCoverage.fileMetrics.map((metric) => ({
          id: metric.id,
          coverageSnapshotId: metric.coverageSnapshotId,
          filePath: metric.filePath,
          linePct: metric.linePct,
          branchPct: metric.branchPct,
          functionPct: metric.functionPct,
          statementPct: metric.statementPct,
          uncoveredLines: metric.uncoveredLines as number[],
          uncoveredBranches: metric.uncoveredBranches as string[]
        }))
      );

      await this.updateRun(payload.runId, {
        status: "running",
        summary: `Generating tests to unblock ${candidate.packageName}.`
      });

      const testPlan = await this.withStep(payload.runId, "plan_tests", null, async () =>
        this.orchestrator.buildTestPlan({
          repository,
          candidate,
          lowCoverageMetrics
        })
      );

      const targetSource = testPlan.targetFiles[0];
      if (!targetSource) {
        throw new Error("No target file was selected for test generation.");
      }

      const resolvedSourcePath = path.isAbsolute(targetSource) ? targetSource : path.join(repoDir, targetSource);
      const sourceText = await readFile(resolvedSourcePath, "utf8");
      const generatedTest = await this.orchestrator["llmClient"].summarizeText({
        prompt: [
          `You are generating a ${repository.testFramework} unit test file for Dependency Steward.`,
          `Repository: ${repository.fullName}`,
          `Dependency candidate: ${candidate.packageName} ${candidate.currentVersion} -> ${candidate.targetVersion}`,
          `Target file: ${targetSource}`,
          `Scenarios: ${testPlan.scenarioList.join(" | ")}`,
          "Return only the test file code. Do not include markdown fences. Do not modify production code.",
          "Source file:",
          sourceText
        ].join("\n\n"),
        temperature: 0.2
      });

      const extension = resolvedSourcePath.endsWith(".tsx") ? ".tsx" : ".ts";
      const generatedTestPath = resolvedSourcePath.replace(/\.[^.]+$/, `.steward.generated.test${extension}`);
      await this.withStep(payload.runId, "write_generated_tests", null, async () => {
        await writeFile(generatedTestPath, `${stripCodeFences(generatedTest)}\n`, "utf8");
        return { generatedTestPath };
      });

      const verificationReports = await this.withStep(payload.runId, "verify_generated_tests", null, async () =>
        this.runVerification(repoDir, policy, repository.packageManager)
      );

      if (verificationReports.some((report) => !report.success)) {
        await this.writeArtifact(payload.runId, "summary", "generated-test-verification.log", JSON.stringify(verificationReports, null, 2));
        await this.updateRun(payload.runId, {
          status: "awaiting_manual_review",
          failureCategory: "generated_tests_failed",
          blockingReason: "Generated tests did not pass verification consistently.",
          endedAt: new Date()
        });
        return;
      }

      const branchName = this.orchestrator.buildBranchName(candidate, "tests", payload.runId);
      await this.createPatchArtifact(payload.runId, repoDir);
      await this.commitAndPushChanges({
        repo: repository,
        repoDir,
        branchName,
        commitMessage: `test: backfill coverage for ${candidate.packageName}`,
        token: workspaceRef.installation?.token
      });

      const pullRequest = await this.createPullRequestRecord({
        runId: payload.runId,
        repository,
        branchName,
        title: `test: backfill coverage before upgrading ${candidate.packageName}`,
        body: [
          `Generated tests to improve coverage before upgrading ${candidate.packageName}.`,
          "",
          ...testPlan.scenarioList.map((scenario) => `- ${scenario}`),
          "",
          `Run ID: ${payload.runId}`
        ].join("\n"),
        labels: ["ds-generated", "test-backfill", `risk-${candidate.riskTier}`],
        token: workspaceRef.installation?.token
      });

      await prisma.deferredUpgrade.create({
        data: {
          repositoryId: repository.id,
          originatingRunId: payload.runId,
          prerequisitePrId: pullRequest.id,
          dependencyCandidateId: candidate.id,
          packageName: candidate.packageName,
          targetVersion: candidate.targetVersion,
          originBaseSha: await this.resolveBaseSha(repoDir),
          policyVersion: policy.id,
          status: "pending"
        }
      });

      await prisma.evaluationRecord.upsert({
        where: { runId: payload.runId },
        create: {
          runId: payload.runId,
          coverageDelta: 2,
          passedVerification: true,
          flakeDetected: false,
          generatedFilesCount: 1,
          acceptedByHuman: false
        },
        update: {
          coverageDelta: 2,
          passedVerification: true,
          generatedFilesCount: 1
        }
      });

      await this.updateRun(payload.runId, {
        status: "waiting_for_followup",
        summary: `Test-backfill PR created for ${candidate.packageName}; waiting for merge.`,
        endedAt: new Date()
      });
    } catch (error) {
      await this.updateRun(payload.runId, {
        status: "failed",
        failureCategory: "test_backfill_failed",
        blockingReason: error instanceof Error ? error.message : "Test backfill job failed.",
        endedAt: new Date()
      });
    } finally {
      if (workspaceRef) {
        await this.sandbox.cleanupWorkspace(workspaceRef.workspace);
      }
    }
  }

  async processFollowUpJob(payload: FollowUpJobPayload) {
    const deferred = await prisma.deferredUpgrade.findUnique({ where: { id: payload.deferredUpgradeId } });
    if (!deferred) {
      return;
    }

    await prisma.deferredUpgrade.update({
      where: { id: deferred.id },
      data: {
        status: "resumed",
        resumedAt: new Date()
      }
    });

    const upgradeRun = await this.createQueuedRun({
      repositoryId: payload.repositoryId,
      dependencyCandidateId: deferred.dependencyCandidateId,
      runType: "upgrade",
      triggerSource: "follow_up",
      summary: `Follow-up upgrade for ${deferred.packageName}`,
      resumedFromDeferredUpgradeId: deferred.id
    });

    await this.processUpgradeJob({
      runId: upgradeRun.id,
      repositoryId: payload.repositoryId,
      candidateId: deferred.dependencyCandidateId,
      correlationId: upgradeRun.correlationId,
      deferredUpgradeId: deferred.id
    });
  }
}
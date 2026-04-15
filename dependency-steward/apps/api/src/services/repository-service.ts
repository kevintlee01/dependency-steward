import { prisma } from "@dependency-steward/db";
import {
  type DashboardData,
  type DependencyCandidate,
  type DependencyCandidateView,
  type HealthResponse,
  type PolicyRecord,
  type PolicyView,
  type PullRequestRecord,
  type RepositoryDetailView,
  type RepositoryRecord,
  type RepositorySummary,
  type RunDetail,
  type RunRecord,
  type RunSummary,
  createDefaultPolicy,
  createId,
  nowIso
} from "@dependency-steward/shared";

function toRepositoryRecord(repository: any): RepositoryRecord {
  return {
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
  };
}

function toPolicyView(policy: any): PolicyView {
  return {
    id: policy.id,
    repositoryId: policy.repositoryId,
    minRepoCoverage: policy.minRepoCoverage,
    minImpactedCoverage: policy.minImpactedCoverage,
    coverageAlertThreshold: policy.coverageAlertThreshold,
    allowedUpgradeKinds: policy.allowedUpgradeKinds as PolicyRecord["allowedUpgradeKinds"],
    securityOverrideEnabled: policy.securityOverrideEnabled,
    autoCreatePrs: policy.autoCreatePrs,
    testBackfillEnabled: policy.testBackfillEnabled,
    maxRepairAttempts: policy.maxRepairAttempts,
    requiredPassingTestRuns: policy.requiredPassingTestRuns,
    coverageSourcePreference: policy.coverageSourcePreference,
    coverageWorkflowName: policy.coverageWorkflowName,
    coverageArtifactName: policy.coverageArtifactName,
    lifecycleScriptsPolicy: policy.lifecycleScriptsPolicy,
    verificationCommands: policy.verificationCommands as string[],
    createdAt: policy.createdAt.toISOString(),
    updatedAt: policy.updatedAt.toISOString(),
    lastUpdatedAt: policy.updatedAt.toISOString(),
    lastUpdatedBy: null
  };
}

function toCandidate(candidate: any): DependencyCandidate {
  return {
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
    rationale: candidate.rationale as string[],
    breakingSignals: candidate.breakingSignals as string[]
  };
}

function toPullRequestRecord(record: any): PullRequestRecord {
  return {
    id: record.id,
    repositoryId: record.repositoryId,
    runId: record.runId,
    githubPrNumber: record.githubPrNumber,
    title: record.title,
    url: record.url,
    branchName: record.branchName,
    prType: record.prType,
    status: record.status,
    mergedAt: record.mergedAt?.toISOString() ?? null,
    mergeCommitSha: record.mergeCommitSha
  };
}

function toRunSummary(run: any): RunSummary {
  const recommendedAction =
    run.status === "awaiting_manual_review"
      ? "manual-review"
      : run.runType === "test_backfill"
        ? "tests-first"
        : "upgrade-now";

  return {
    runId: run.id,
    runType: run.runType,
    status: run.status,
    repositoryId: run.repositoryId,
    startedAt: run.startedAt.toISOString(),
    endedAt: run.endedAt?.toISOString() ?? null,
    headline: run.summary ?? `${run.runType.replaceAll("_", " ")} run`,
    recommendedAction,
    blockingReason: run.blockingReason,
    nextAction: run.status === "awaiting_manual_review" ? "Resolve manual review or requeue the work." : null
  };
}

export async function createRepository(input: {
  fullName: string;
  owner?: string;
  name?: string;
  repoUrl?: string | null;
  localPath?: string | null;
  defaultBranch?: string;
}): Promise<RepositoryDetailView> {
  const [derivedOwner = input.owner ?? "unknown", derivedName = input.name ?? input.fullName] = input.fullName.split("/");

  const created = await prisma.$transaction(async (transaction) => {
    const repository = await transaction.repository.create({
      data: {
        owner: input.owner ?? derivedOwner,
        name: input.name ?? derivedName,
        fullName: input.fullName,
        repoUrl: input.repoUrl,
        localPath: input.localPath,
        defaultBranch: input.defaultBranch ?? "main",
        packageManager: "unknown",
        testFramework: "unknown",
        onboardingState: "pending",
        healthStatus: "unknown"
      }
    });

    const defaultPolicy = createDefaultPolicy(repository.id);
    const policy = await transaction.policy.create({
      data: {
        id: defaultPolicy.id,
        repositoryId: repository.id,
        minRepoCoverage: defaultPolicy.minRepoCoverage,
        minImpactedCoverage: defaultPolicy.minImpactedCoverage,
        coverageAlertThreshold: defaultPolicy.coverageAlertThreshold,
        allowedUpgradeKinds: defaultPolicy.allowedUpgradeKinds,
        securityOverrideEnabled: defaultPolicy.securityOverrideEnabled,
        autoCreatePrs: defaultPolicy.autoCreatePrs,
        testBackfillEnabled: defaultPolicy.testBackfillEnabled,
        maxRepairAttempts: defaultPolicy.maxRepairAttempts,
        requiredPassingTestRuns: defaultPolicy.requiredPassingTestRuns,
        coverageSourcePreference: defaultPolicy.coverageSourcePreference,
        coverageWorkflowName: defaultPolicy.coverageWorkflowName,
        coverageArtifactName: defaultPolicy.coverageArtifactName,
        lifecycleScriptsPolicy: defaultPolicy.lifecycleScriptsPolicy,
        verificationCommands: defaultPolicy.verificationCommands
      }
    });

    await transaction.repository.update({
      where: { id: repository.id },
      data: { activePolicyId: policy.id, onboardingState: "active" }
    });

    return { repository, policy };
  });

  return {
    repository: {
      ...toRepositoryRecord({
        ...created.repository,
        activePolicyId: created.policy.id,
        onboardingState: "active"
      }),
      onboardingState: "active"
    },
    policy: toPolicyView(created.policy),
    latestCoverage: null,
    candidates: [],
    recentRuns: [],
    pullRequests: []
  };
}

export async function listRepositories(): Promise<RepositorySummary[]> {
  const repositories = await prisma.repository.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      coverageSnapshots: { orderBy: { generatedAt: "desc" }, take: 1 },
      pullRequests: { where: { status: "open" } },
      policies: { orderBy: { updatedAt: "desc" }, take: 1 }
    }
  });

  return repositories.map((repository) => ({
    repoId: repository.id,
    fullName: repository.fullName,
    packageManager: repository.packageManager,
    testFramework: repository.testFramework,
    defaultBranch: repository.defaultBranch,
    healthStatus: repository.healthStatus,
    latestCoverage: repository.coverageSnapshots[0]?.linePct ?? null,
    coverageAlertThreshold: repository.policies[0]?.coverageAlertThreshold ?? null,
    openGeneratedPrCount: repository.pullRequests.length
  }));
}

export async function getDashboardData(): Promise<DashboardData> {
  const [repositories, runs, candidates] = await Promise.all([
    listRepositories(),
    prisma.run.findMany({
      where: {
        status: {
          in: ["queued", "preparing", "running", "awaiting_manual_review", "waiting_for_followup"]
        }
      },
      orderBy: { startedAt: "desc" },
      take: 10
    }),

    prisma.dependencyCandidate.findMany({
      where: {
        status: { not: "bypassed" },
        OR: [{ advisorySeverity: { in: ["high", "critical"] } }, { riskTier: "high" }]
      },
      orderBy: [{ advisorySeverity: "desc" }, { riskScore: "desc" }],
      take: 10,
      include: { snapshot: { include: { repository: true } } }
    })
  ]);

  return {
    repositories,
    pendingRuns: runs.map(toRunSummary),
    vulnerableCandidates: candidates.map(
      (candidate): DependencyCandidateView => ({
        packageName: candidate.packageName,
        currentVersion: candidate.currentVersion,
        targetVersion: candidate.targetVersion,
        advisorySeverity: candidate.advisorySeverity,
        riskTier: candidate.riskTier,
        recommendedAction: candidate.recommendedAction as DependencyCandidateView["recommendedAction"],
        changelogSummary: candidate.changelogSummary,
        repositoryId: (candidate as any).snapshot?.repository?.id ?? "",
        repositoryFullName: (candidate as any).snapshot?.repository?.fullName ?? "unknown"
      })
    ),
    manualReviewCount: runs.filter((run) => run.status === "awaiting_manual_review").length
  };
}

export async function getRepositoryDetail(repoId: string): Promise<RepositoryDetailView | null> {
  const repository = await prisma.repository.findUnique({
    where: { id: repoId },
    include: {
      policies: { orderBy: { updatedAt: "desc" }, take: 1 },
      coverageSnapshots: {
        orderBy: { generatedAt: "desc" },
        take: 1,
        include: { fileMetrics: true }
      },
      dependencySnapshots: {
        orderBy: { generatedAt: "desc" },
        take: 1,
        include: { candidates: { orderBy: { riskScore: "desc" } } }
      },
      runs: { orderBy: { startedAt: "desc" }, take: 10 },
      pullRequests: { orderBy: { id: "desc" }, take: 10 }
    }
  });

  if (!repository) {
    return null;
  }

  const latestCoverage = repository.coverageSnapshots[0]
    ? {
        id: repository.coverageSnapshots[0].id,
        repositoryId: repository.id,
        commitSha: repository.coverageSnapshots[0].commitSha,
        generatedAt: repository.coverageSnapshots[0].generatedAt.toISOString(),
        linePct: repository.coverageSnapshots[0].linePct,
        branchPct: repository.coverageSnapshots[0].branchPct,
        functionPct: repository.coverageSnapshots[0].functionPct,
        statementPct: repository.coverageSnapshots[0].statementPct,
        artifactId: repository.coverageSnapshots[0].artifactId,
        fileMetrics: repository.coverageSnapshots[0].fileMetrics.map((metric) => ({
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
      }
    : null;

  return {
    repository: toRepositoryRecord(repository),
    policy: repository.policies[0] ? toPolicyView(repository.policies[0]) : null,
    latestCoverage,
    candidates: repository.dependencySnapshots[0]?.candidates.map(toCandidate) ?? [],
    recentRuns: repository.runs.map(toRunSummary),
    pullRequests: repository.pullRequests.map(toPullRequestRecord)
  };
}

export async function updatePolicy(
  repositoryId: string,
  patch: Partial<Omit<PolicyRecord, "id" | "repositoryId" | "createdAt" | "updatedAt">>
): Promise<PolicyView | null> {
  const repository = await prisma.repository.findUnique({
    where: { id: repositoryId },
    include: { policies: { orderBy: { updatedAt: "desc" }, take: 1 } }
  });

  if (!repository) {
    return null;
  }

  const currentPolicy = repository.policies[0]
    ? toPolicyView(repository.policies[0])
    : createDefaultPolicy(repository.id);

  const nextPolicy = {
    ...currentPolicy,
    ...patch,
    id: createId(),
    repositoryId,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  const policy = await prisma.policy.create({
    data: {
      id: nextPolicy.id,
      repositoryId,
      minRepoCoverage: nextPolicy.minRepoCoverage,
      minImpactedCoverage: nextPolicy.minImpactedCoverage,
      coverageAlertThreshold: nextPolicy.coverageAlertThreshold,
      allowedUpgradeKinds: nextPolicy.allowedUpgradeKinds,
      securityOverrideEnabled: nextPolicy.securityOverrideEnabled,
      autoCreatePrs: nextPolicy.autoCreatePrs,
      testBackfillEnabled: nextPolicy.testBackfillEnabled,
      maxRepairAttempts: nextPolicy.maxRepairAttempts,
      requiredPassingTestRuns: nextPolicy.requiredPassingTestRuns,
      coverageSourcePreference: nextPolicy.coverageSourcePreference,
      coverageWorkflowName: nextPolicy.coverageWorkflowName,
      coverageArtifactName: nextPolicy.coverageArtifactName,
      lifecycleScriptsPolicy: nextPolicy.lifecycleScriptsPolicy,
      verificationCommands: nextPolicy.verificationCommands
    }
  });

  await prisma.repository.update({
    where: { id: repositoryId },
    data: { activePolicyId: policy.id }
  });

  return toPolicyView(policy);
}

export async function updateRepository(
  repositoryId: string,
  patch: { defaultBranch?: string; packageManager?: string; testFramework?: string }
): Promise<RepositoryRecord | null> {
  const repository = await prisma.repository.findUnique({ where: { id: repositoryId } });
  if (!repository) return null;

  const updated = await prisma.repository.update({
    where: { id: repositoryId },
    data: {
      ...(patch.defaultBranch !== undefined && { defaultBranch: patch.defaultBranch }),
      ...(patch.packageManager !== undefined && { packageManager: patch.packageManager as any }),
      ...(patch.testFramework !== undefined && { testFramework: patch.testFramework as any })
    }
  });

  return toRepositoryRecord(updated);
}

export async function createQueuedRun(input: {
  repositoryId: string;
  runType: RunRecord["runType"];
  triggerSource: RunRecord["triggerSource"];
  summary: string;
  dependencyCandidateId?: string;
}): Promise<RunRecord | null> {
  const repository = await prisma.repository.findUnique({
    where: { id: input.repositoryId }
  });

  if (!repository) {
    return null;
  }

  const run = await prisma.run.create({
    data: {
      repositoryId: repository.id,
      dependencyCandidateId: input.dependencyCandidateId,
      runType: input.runType,
      triggerSource: input.triggerSource,
      status: "queued",
      baseBranch: repository.defaultBranch,
      baseSha: null,
      policyVersion: repository.activePolicyId,
      correlationId: createId(),
      summary: input.summary
    }
  });

  return {
    id: run.id,
    repositoryId: run.repositoryId,
    dependencyCandidateId: run.dependencyCandidateId,
    runType: run.runType,
    triggerSource: run.triggerSource,
    status: run.status,
    baseBranch: run.baseBranch,
    baseSha: run.baseSha,
    policyVersion: run.policyVersion,
    correlationId: run.correlationId,
    startedAt: run.startedAt.toISOString(),
    endedAt: null,
    summary: run.summary,
    failureCategory: run.failureCategory,
    blockingReason: run.blockingReason,
    resumedFromDeferredUpgradeId: run.resumedFromDeferredUpgradeId
  };
}

export async function listRuns(repositoryId: string): Promise<RunSummary[]> {
  const runs = await prisma.run.findMany({
    where: { repositoryId },
    orderBy: { startedAt: "desc" },
    take: 30
  });

  return runs.map(toRunSummary);
}

export async function getRunDetail(runId: string): Promise<RunDetail | null> {
  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: {
      steps: true,
      artifacts: true,
      pullRequests: true,
      evaluation: true,
      dependencyCandidate: true,
      resumedFromDeferredUpgrade: true
    }
  });

  if (!run) {
    return null;
  }

  const summary = toRunSummary(run);
  return {
    ...summary,
    steps: run.steps.map((step) => ({
      id: step.id,
      runId: step.runId,
      stepKey: step.stepKey,
      status: step.status,
      startedAt: step.startedAt?.toISOString() ?? null,
      endedAt: step.endedAt?.toISOString() ?? null,
      inputJson: (step.inputJson as Record<string, unknown> | null) ?? null,
      outputJson: (step.outputJson as Record<string, unknown> | null) ?? null,
      logArtifactId: step.logArtifactId,
      errorCode: step.errorCode
    })),
    artifacts: run.artifacts.map((artifact) => ({
      id: artifact.id,
      runId: artifact.runId,
      artifactType: artifact.artifactType,
      storageKey: artifact.storageKey,
      contentType: artifact.contentType,
      byteSize: artifact.byteSize,
      createdAt: artifact.createdAt.toISOString()
    })),
    pullRequest: run.pullRequests[0] ? toPullRequestRecord(run.pullRequests[0]) : null,
    coverageDelta: run.evaluation?.coverageDelta ?? null,
    dependencyCandidate: run.dependencyCandidate ? toCandidate(run.dependencyCandidate) : null,
    failureCategory: run.failureCategory,
    manualReview: run.blockingReason
      ? {
          reasonCode: run.failureCategory ?? "manual_review",
          message: run.blockingReason,
          nextAction: "Resolve manually or requeue the run."
        }
      : null,
    deferredUpgrade: run.resumedFromDeferredUpgrade
      ? {
          id: run.resumedFromDeferredUpgrade.id,
          repositoryId: run.resumedFromDeferredUpgrade.repositoryId,
          originatingRunId: run.resumedFromDeferredUpgrade.originatingRunId,
          prerequisitePrId: run.resumedFromDeferredUpgrade.prerequisitePrId,
          dependencyCandidateId: run.resumedFromDeferredUpgrade.dependencyCandidateId,
          packageName: run.resumedFromDeferredUpgrade.packageName,
          targetVersion: run.resumedFromDeferredUpgrade.targetVersion,
          originBaseSha: run.resumedFromDeferredUpgrade.originBaseSha,
          effectiveBaseSha: run.resumedFromDeferredUpgrade.effectiveBaseSha,
          policyVersion: run.resumedFromDeferredUpgrade.policyVersion,
          status: run.resumedFromDeferredUpgrade.status,
          createdAt: run.resumedFromDeferredUpgrade.createdAt.toISOString(),
          resumedAt: run.resumedFromDeferredUpgrade.resumedAt?.toISOString() ?? null,
          resolvedAt: run.resumedFromDeferredUpgrade.resolvedAt?.toISOString() ?? null
        }
      : null
  };
}

export async function listDependencyCandidates(repositoryId: string): Promise<DependencyCandidate[]> {
  const snapshot = await prisma.dependencySnapshot.findFirst({
    where: { repositoryId },
    orderBy: { generatedAt: "desc" },
    include: { candidates: { orderBy: { riskScore: "desc" } } }
  });

  return snapshot?.candidates.map(toCandidate) ?? [];
}

export async function getLatestCoverage(repositoryId: string) {
  const repository = await getRepositoryDetail(repositoryId);
  return repository?.latestCoverage ?? null;
}

export async function resolveManualReview(runId: string): Promise<RunSummary | null> {
  const run = await prisma.run.update({
    where: { id: runId },
    data: {
      status: "superseded",
      endedAt: new Date(),
      summary: "Manual review resolved"
    }
  });

  return toRunSummary(run);
}

export async function recordWebhookDelivery(input: {
  deliveryId: string;
  eventName: string;
  payload: Record<string, unknown>;
  repositoryId?: string;
  runId?: string;
}): Promise<void> {
  await prisma.webhookDelivery.upsert({
    where: { deliveryId: input.deliveryId },
    create: {
      deliveryId: input.deliveryId,
      eventName: input.eventName,
      payload: input.payload,
      repositoryId: input.repositoryId,
      runId: input.runId
    },
    update: {
      payload: input.payload,
      repositoryId: input.repositoryId,
      runId: input.runId
    }
  });
}

export async function buildHealthResponse(input: {
  githubConfigured: boolean;
  llmConfigured: boolean;
  redisConfigured: boolean;
}): Promise<HealthResponse> {
  let databaseStatus: HealthResponse["services"]["database"] = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    databaseStatus = "unavailable";
  }

  return {
    status: databaseStatus === "ok" ? "ok" : "degraded",
    services: {
      database: databaseStatus,
      redis: input.redisConfigured ? "configured" : "not_configured",
      github: input.githubConfigured ? "configured" : "not_configured",
      llm: input.llmConfigured ? "configured" : "not_configured"
    }
  };
}
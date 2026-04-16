const _crypto = typeof globalThis.crypto !== "undefined" ? globalThis.crypto : undefined;

export const packageManagers = ["npm", "pnpm", "unknown"] as const;
export type PackageManager = (typeof packageManagers)[number];

export const testFrameworks = ["jest", "vitest", "unknown"] as const;
export type TestFramework = (typeof testFrameworks)[number];

export const onboardingStates = ["pending", "active", "unsupported"] as const;
export type OnboardingState = (typeof onboardingStates)[number];

export const healthStatuses = ["healthy", "attention", "critical", "unknown"] as const;
export type HealthStatus = (typeof healthStatuses)[number];

export const dependencyKinds = ["patch", "minor", "major"] as const;
export type DependencyKind = (typeof dependencyKinds)[number];

export const dependencyDirectness = ["direct", "transitive"] as const;
export type DependencyDirectness = (typeof dependencyDirectness)[number];

export const advisorySeverities = ["none", "low", "medium", "high", "critical"] as const;
export type AdvisorySeverity = (typeof advisorySeverities)[number];

export const riskTiers = ["low", "medium", "high"] as const;
export type RiskTier = (typeof riskTiers)[number];

export const runTypes = ["scan", "test_backfill", "upgrade", "follow_up"] as const;
export type RunType = (typeof runTypes)[number];

export const triggerSources = ["scheduled", "manual", "webhook", "follow_up"] as const;
export type TriggerSource = (typeof triggerSources)[number];

export const runStatuses = [
  "queued",
  "preparing",
  "running",
  "awaiting_manual_review",
  "waiting_for_followup",
  "succeeded",
  "failed",
  "cancelled",
  "superseded"
] as const;
export type RunStatus = (typeof runStatuses)[number];

export const stepStatuses = ["pending", "in_progress", "blocked", "succeeded", "failed", "skipped"] as const;
export type StepStatus = (typeof stepStatuses)[number];

export const artifactTypes = [
  "log",
  "coverage",
  "patch",
  "summary",
  "transcript",
  "changelog",
  "pr_body"
] as const;
export type ArtifactType = (typeof artifactTypes)[number];

export const prTypes = ["test_backfill", "dependency_upgrade"] as const;
export type PrType = (typeof prTypes)[number];

export const prStatuses = ["open", "merged", "closed", "draft"] as const;
export type PrStatus = (typeof prStatuses)[number];

export const coverageSourcePreferences = ["worker", "github_actions"] as const;
export type CoverageSourcePreference = (typeof coverageSourcePreferences)[number];

export const lifecycleScriptPolicies = ["disallow", "allowlist_only"] as const;
export type LifecycleScriptsPolicy = (typeof lifecycleScriptPolicies)[number];

export const candidateStatuses = ["identified", "deferred", "ready", "manual_review", "completed", "bypassed"] as const;
export type CandidateStatus = (typeof candidateStatuses)[number];

export const deferredUpgradeStatuses = ["pending", "resumed", "resolved", "superseded"] as const;
export type DeferredUpgradeStatus = (typeof deferredUpgradeStatuses)[number];

export const recommendedActions = ["upgrade-now", "tests-first", "manual-review"] as const;
export type RecommendedAction = (typeof recommendedActions)[number];

export interface RepositoryRecord {
  id: string;
  installationId?: string | null;
  owner: string;
  name: string;
  fullName: string;
  repoUrl?: string | null;
  localPath?: string | null;
  packageRoot?: string | null;
  defaultBranch: string;
  packageManager: PackageManager;
  testFramework: TestFramework;
  onboardingState: OnboardingState;
  healthStatus: HealthStatus;
  activePolicyId?: string | null;
  lastScanAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyRecord {
  id: string;
  repositoryId: string;
  minRepoCoverage: number;
  minImpactedCoverage: number;
  coverageAlertThreshold: number;
  allowedUpgradeKinds: DependencyKind[];
  securityOverrideEnabled: boolean;
  autoCreatePrs: boolean;
  testBackfillEnabled: boolean;
  maxRepairAttempts: number;
  requiredPassingTestRuns: number;
  coverageSourcePreference: CoverageSourcePreference;
  coverageWorkflowName?: string | null;
  coverageArtifactName?: string | null;
  lifecycleScriptsPolicy: LifecycleScriptsPolicy;
  verificationCommands: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DependencySnapshotRecord {
  id: string;
  repositoryId: string;
  commitSha: string;
  generatedAt: string;
  manifestPath: string;
  lockfilePath?: string | null;
  packageManager: PackageManager;
}

export interface DependencyCandidate {
  id: string;
  snapshotId: string;
  packageName: string;
  currentVersion: string;
  targetVersion: string;
  kind: DependencyKind;
  directness: DependencyDirectness;
  advisorySeverity: AdvisorySeverity;
  riskScore: number;
  riskTier: RiskTier;
  recommendedAction: RecommendedAction;
  changelogSummary: string;
  status: CandidateStatus;
  rationale: string[];
  breakingSignals: string[];
}

export interface CoverageFileMetric {
  id: string;
  coverageSnapshotId: string;
  filePath: string;
  linePct: number;
  branchPct: number;
  functionPct: number;
  statementPct: number;
  uncoveredLines: number[];
  uncoveredBranches: string[];
}

export interface CoverageSnapshotRecord {
  id: string;
  repositoryId: string;
  commitSha: string;
  generatedAt: string;
  linePct: number;
  branchPct: number;
  functionPct: number;
  statementPct: number;
  artifactId?: string | null;
  fileMetrics: CoverageFileMetric[];
}

export interface ArtifactRecord {
  id: string;
  runId: string;
  artifactType: ArtifactType;
  storageKey: string;
  contentType: string;
  byteSize: number;
  createdAt: string;
}

export interface RunStepRecord {
  id: string;
  runId: string;
  stepKey: string;
  status: StepStatus;
  startedAt?: string | null;
  endedAt?: string | null;
  inputJson?: Record<string, unknown> | null;
  outputJson?: Record<string, unknown> | null;
  logArtifactId?: string | null;
  errorCode?: string | null;
}

export interface PullRequestRecord {
  id: string;
  repositoryId: string;
  runId: string;
  githubPrNumber?: number | null;
  title: string;
  url?: string | null;
  branchName: string;
  prType: PrType;
  status: PrStatus;
  mergedAt?: string | null;
  mergeCommitSha?: string | null;
}

export interface DeferredUpgradeRecord {
  id: string;
  repositoryId: string;
  originatingRunId: string;
  prerequisitePrId: string;
  dependencyCandidateId: string;
  packageName: string;
  targetVersion: string;
  originBaseSha: string;
  effectiveBaseSha?: string | null;
  policyVersion: string;
  status: DeferredUpgradeStatus;
  createdAt: string;
  resumedAt?: string | null;
  resolvedAt?: string | null;
}

export interface EvaluationRecord {
  id: string;
  runId: string;
  coverageDelta: number;
  passedVerification: boolean;
  flakeDetected: boolean;
  generatedFilesCount: number;
  acceptedByHuman: boolean;
  createdAt: string;
}

export interface RunRecord {
  id: string;
  repositoryId: string;
  dependencyCandidateId?: string | null;
  runType: RunType;
  triggerSource: TriggerSource;
  status: RunStatus;
  baseBranch: string;
  baseSha?: string | null;
  policyVersion?: string | null;
  correlationId: string;
  startedAt: string;
  endedAt?: string | null;
  summary?: string | null;
  failureCategory?: string | null;
  blockingReason?: string | null;
  resumedFromDeferredUpgradeId?: string | null;
}

export interface ManualReviewRecord {
  reasonCode: string;
  message: string;
  nextAction: string;
}

export interface PolicyEvaluationInput {
  repositorySupported: boolean;
  coverageAvailable: boolean;
  impactedMappingConfidence: "high" | "low";
  riskTier: RiskTier;
  dependencyKind: DependencyKind;
  advisorySeverity: AdvisorySeverity;
  repositoryCoverage?: number | null;
  impactedCoverage?: number | null;
  policy: PolicyRecord;
}

export interface PolicyDecision {
  action: RecommendedAction;
  reason: string;
  securityOverrideApplied: boolean;
  priority: "normal" | "elevated";
  manualReview?: ManualReviewRecord;
}

export interface RunSummary {
  runId: string;
  runType: RunType;
  status: RunStatus;
  repositoryId: string;
  startedAt: string;
  endedAt?: string | null;
  headline: string;
  recommendedAction: RecommendedAction;
  blockingReason?: string | null;
  nextAction?: string | null;
}

export interface RunDetail extends RunSummary {
  steps: RunStepRecord[];
  artifacts: ArtifactRecord[];
  pullRequest?: PullRequestRecord | null;
  coverageDelta?: number | null;
  dependencyCandidate?: DependencyCandidate | null;
  failureCategory?: string | null;
  manualReview?: ManualReviewRecord | null;
  deferredUpgrade?: DeferredUpgradeRecord | null;
}

export interface RepositorySummary {
  repoId: string;
  fullName: string;
  packageManager: PackageManager;
  testFramework: TestFramework;
  defaultBranch: string;
  healthStatus: HealthStatus;
  latestCoverage?: number | null;
  coverageAlertThreshold?: number | null;
  openGeneratedPrCount: number;
}

export interface PolicyView extends PolicyRecord {
  lastUpdatedBy?: string | null;
  lastUpdatedAt?: string | null;
}

export interface DependencyCandidateView {
  packageName: string;
  currentVersion: string;
  targetVersion: string;
  advisorySeverity: AdvisorySeverity;
  riskTier: RiskTier;
  recommendedAction: RecommendedAction;
  changelogSummary: string;
  repositoryId: string;
  repositoryFullName: string;
}

export interface DashboardData {
  repositories: RepositorySummary[];
  pendingRuns: RunSummary[];
  vulnerableCandidates: DependencyCandidateView[];
  manualReviewCount: number;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  services: {
    database: "ok" | "unavailable";
    redis: "configured" | "not_configured";
    github: "configured" | "not_configured";
    llm: "configured" | "not_configured";
  };
}

export interface RepositoryDetailView {
  repository: RepositoryRecord;
  policy: PolicyView | null;
  latestCoverage: CoverageSnapshotRecord | null;
  candidates: DependencyCandidate[];
  recentRuns: RunSummary[];
  pullRequests: PullRequestRecord[];
}

export interface VerificationReport {
  command: string;
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export function createId(): string {
  return _crypto?.randomUUID() ?? Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function createDefaultPolicy(repositoryId: string): PolicyRecord {
  const timestamp = nowIso();

  return {
    id: createId(),
    repositoryId,
    minRepoCoverage: 80,
    minImpactedCoverage: 75,
    coverageAlertThreshold: 70,
    allowedUpgradeKinds: ["patch", "minor"],
    securityOverrideEnabled: true,
    autoCreatePrs: true,
    testBackfillEnabled: true,
    maxRepairAttempts: 2,
    requiredPassingTestRuns: 3,
    coverageSourcePreference: "github_actions",
    coverageWorkflowName: "coverage",
    coverageArtifactName: "coverage-artifact",
    lifecycleScriptsPolicy: "disallow",
    verificationCommands: ["npm test", "npm run lint", "npm run typecheck"],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}
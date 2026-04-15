import {
  type DashboardData,
  type RepositorySummary,
  type RunSummary,
  createId,
  nowIso
} from "../types";

export function createMockDashboard(): DashboardData {
  const repositories: RepositorySummary[] = [
    {
      repoId: createId(),
      fullName: "acme/order-service",
      packageManager: "npm",
      testFramework: "vitest",
      defaultBranch: "main",
      healthStatus: "attention",
      latestCoverage: 72,
      openGeneratedPrCount: 1
    },
    {
      repoId: createId(),
      fullName: "acme/marketing-site",
      packageManager: "pnpm",
      testFramework: "jest",
      defaultBranch: "main",
      healthStatus: "healthy",
      latestCoverage: 88,
      openGeneratedPrCount: 0
    }
  ];

  const pendingRuns: RunSummary[] = [
    {
      runId: createId(),
      runType: "upgrade",
      status: "running",
      repositoryId: repositories[0].repoId,
      startedAt: nowIso(),
      headline: "Upgrading vite from 5.4.11 to 6.0.2",
      recommendedAction: "upgrade-now"
    },
    {
      runId: createId(),
      runType: "test_backfill",
      status: "awaiting_manual_review",
      repositoryId: repositories[1].repoId,
      startedAt: nowIso(),
      headline: "Coverage backfill for payment adapter",
      recommendedAction: "manual-review",
      blockingReason: "Lifecycle scripts must be allowlisted before install"
    }
  ];

  return {
    repositories,
    pendingRuns,
    vulnerableCandidates: [
      {
        packageName: "axios",
        currentVersion: "1.7.3",
        targetVersion: "1.7.9",
        advisorySeverity: "high",
        riskTier: "medium",
        recommendedAction: "tests-first",
        changelogSummary: "Security patch with a narrow API surface change."
      }
    ],
    manualReviewCount: 1
  };
}
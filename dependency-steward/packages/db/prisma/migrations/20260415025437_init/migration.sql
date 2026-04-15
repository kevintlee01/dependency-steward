-- CreateEnum
CREATE TYPE "PackageManager" AS ENUM ('npm', 'pnpm', 'unknown');

-- CreateEnum
CREATE TYPE "TestFramework" AS ENUM ('jest', 'vitest', 'unknown');

-- CreateEnum
CREATE TYPE "OnboardingState" AS ENUM ('pending', 'active', 'unsupported');

-- CreateEnum
CREATE TYPE "HealthStatus" AS ENUM ('healthy', 'attention', 'critical', 'unknown');

-- CreateEnum
CREATE TYPE "DependencyKind" AS ENUM ('patch', 'minor', 'major');

-- CreateEnum
CREATE TYPE "DependencyDirectness" AS ENUM ('direct', 'transitive');

-- CreateEnum
CREATE TYPE "AdvisorySeverity" AS ENUM ('none', 'low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "RiskTier" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('identified', 'deferred', 'ready', 'manual_review', 'completed');

-- CreateEnum
CREATE TYPE "RunType" AS ENUM ('scan', 'test_backfill', 'upgrade', 'follow_up');

-- CreateEnum
CREATE TYPE "TriggerSource" AS ENUM ('scheduled', 'manual', 'webhook', 'follow_up');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('queued', 'preparing', 'running', 'awaiting_manual_review', 'waiting_for_followup', 'succeeded', 'failed', 'cancelled', 'superseded');

-- CreateEnum
CREATE TYPE "StepStatus" AS ENUM ('pending', 'in_progress', 'blocked', 'succeeded', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "PullRequestType" AS ENUM ('test_backfill', 'dependency_upgrade');

-- CreateEnum
CREATE TYPE "PullRequestStatus" AS ENUM ('open', 'merged', 'closed', 'draft');

-- CreateEnum
CREATE TYPE "ArtifactType" AS ENUM ('log', 'coverage', 'patch', 'summary', 'transcript', 'changelog', 'pr_body');

-- CreateEnum
CREATE TYPE "CoverageSourcePreference" AS ENUM ('worker', 'github_actions');

-- CreateEnum
CREATE TYPE "LifecycleScriptsPolicy" AS ENUM ('disallow', 'allowlist_only');

-- CreateEnum
CREATE TYPE "DeferredUpgradeStatus" AS ENUM ('pending', 'resumed', 'resolved', 'superseded');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "githubUserId" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Repository" (
    "id" TEXT NOT NULL,
    "installationId" TEXT,
    "owner" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "repoUrl" TEXT,
    "localPath" TEXT,
    "defaultBranch" TEXT NOT NULL DEFAULT 'main',
    "packageManager" "PackageManager" NOT NULL DEFAULT 'unknown',
    "testFramework" "TestFramework" NOT NULL DEFAULT 'unknown',
    "onboardingState" "OnboardingState" NOT NULL DEFAULT 'pending',
    "healthStatus" "HealthStatus" NOT NULL DEFAULT 'unknown',
    "activePolicyId" TEXT,
    "lastScanAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Repository_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Policy" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "minRepoCoverage" DOUBLE PRECISION NOT NULL,
    "minImpactedCoverage" DOUBLE PRECISION NOT NULL,
    "allowedUpgradeKinds" JSONB NOT NULL,
    "securityOverrideEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoCreatePrs" BOOLEAN NOT NULL DEFAULT true,
    "testBackfillEnabled" BOOLEAN NOT NULL DEFAULT true,
    "maxRepairAttempts" INTEGER NOT NULL DEFAULT 2,
    "requiredPassingTestRuns" INTEGER NOT NULL DEFAULT 3,
    "coverageSourcePreference" "CoverageSourcePreference" NOT NULL DEFAULT 'github_actions',
    "coverageWorkflowName" TEXT,
    "coverageArtifactName" TEXT,
    "lifecycleScriptsPolicy" "LifecycleScriptsPolicy" NOT NULL DEFAULT 'disallow',
    "verificationCommands" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DependencySnapshot" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "commitSha" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "manifestPath" TEXT NOT NULL,
    "lockfilePath" TEXT,
    "packageManager" "PackageManager" NOT NULL DEFAULT 'unknown',

    CONSTRAINT "DependencySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DependencyCandidate" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "packageName" TEXT NOT NULL,
    "currentVersion" TEXT NOT NULL,
    "targetVersion" TEXT NOT NULL,
    "kind" "DependencyKind" NOT NULL,
    "directness" "DependencyDirectness" NOT NULL,
    "advisorySeverity" "AdvisorySeverity" NOT NULL DEFAULT 'none',
    "riskScore" INTEGER NOT NULL,
    "riskTier" "RiskTier" NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "changelogSummary" TEXT NOT NULL,
    "status" "CandidateStatus" NOT NULL DEFAULT 'identified',
    "rationale" JSONB NOT NULL,
    "breakingSignals" JSONB NOT NULL,

    CONSTRAINT "DependencyCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoverageSnapshot" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "commitSha" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "linePct" DOUBLE PRECISION NOT NULL,
    "branchPct" DOUBLE PRECISION NOT NULL,
    "functionPct" DOUBLE PRECISION NOT NULL,
    "statementPct" DOUBLE PRECISION NOT NULL,
    "artifactId" TEXT,

    CONSTRAINT "CoverageSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoverageFileMetric" (
    "id" TEXT NOT NULL,
    "coverageSnapshotId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "linePct" DOUBLE PRECISION NOT NULL,
    "branchPct" DOUBLE PRECISION NOT NULL,
    "functionPct" DOUBLE PRECISION NOT NULL,
    "statementPct" DOUBLE PRECISION NOT NULL,
    "uncoveredLines" JSONB NOT NULL,
    "uncoveredBranches" JSONB NOT NULL,

    CONSTRAINT "CoverageFileMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "dependencyCandidateId" TEXT,
    "runType" "RunType" NOT NULL,
    "triggerSource" "TriggerSource" NOT NULL,
    "status" "RunStatus" NOT NULL,
    "baseBranch" TEXT NOT NULL,
    "baseSha" TEXT,
    "policyVersion" TEXT,
    "correlationId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "summary" TEXT,
    "failureCategory" TEXT,
    "blockingReason" TEXT,
    "resumedFromDeferredUpgradeId" TEXT,

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunStep" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepKey" TEXT NOT NULL,
    "status" "StepStatus" NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "inputJson" JSONB,
    "outputJson" JSONB,
    "logArtifactId" TEXT,
    "errorCode" TEXT,

    CONSTRAINT "RunStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Artifact" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "artifactType" "ArtifactType" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Artifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PullRequestRecord" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "githubPrNumber" INTEGER,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "branchName" TEXT NOT NULL,
    "prType" "PullRequestType" NOT NULL,
    "status" "PullRequestStatus" NOT NULL,
    "mergedAt" TIMESTAMP(3),
    "mergeCommitSha" TEXT,

    CONSTRAINT "PullRequestRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeferredUpgrade" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "originatingRunId" TEXT NOT NULL,
    "prerequisitePrId" TEXT NOT NULL,
    "dependencyCandidateId" TEXT NOT NULL,
    "packageName" TEXT NOT NULL,
    "targetVersion" TEXT NOT NULL,
    "originBaseSha" TEXT NOT NULL,
    "effectiveBaseSha" TEXT,
    "policyVersion" TEXT NOT NULL,
    "status" "DeferredUpgradeStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resumedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "DeferredUpgrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationRecord" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "coverageDelta" DOUBLE PRECISION NOT NULL,
    "passedVerification" BOOLEAN NOT NULL,
    "flakeDetected" BOOLEAN NOT NULL,
    "generatedFilesCount" INTEGER NOT NULL,
    "acceptedByHuman" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "repositoryId" TEXT,
    "runId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_githubUserId_key" ON "User"("githubUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Repository_fullName_key" ON "Repository"("fullName");

-- CreateIndex
CREATE INDEX "Repository_installationId_idx" ON "Repository"("installationId");

-- CreateIndex
CREATE INDEX "Policy_repositoryId_idx" ON "Policy"("repositoryId");

-- CreateIndex
CREATE INDEX "DependencyCandidate_packageName_idx" ON "DependencyCandidate"("packageName");

-- CreateIndex
CREATE INDEX "CoverageFileMetric_coverageSnapshotId_idx" ON "CoverageFileMetric"("coverageSnapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "Run_resumedFromDeferredUpgradeId_key" ON "Run"("resumedFromDeferredUpgradeId");

-- CreateIndex
CREATE INDEX "Run_repositoryId_startedAt_idx" ON "Run"("repositoryId", "startedAt");

-- CreateIndex
CREATE INDEX "Run_status_runType_idx" ON "Run"("status", "runType");

-- CreateIndex
CREATE INDEX "PullRequestRecord_repositoryId_status_idx" ON "PullRequestRecord"("repositoryId", "status");

-- CreateIndex
CREATE INDEX "DeferredUpgrade_repositoryId_packageName_targetVersion_idx" ON "DeferredUpgrade"("repositoryId", "packageName", "targetVersion");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationRecord_runId_key" ON "EvaluationRecord"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookDelivery_deliveryId_key" ON "WebhookDelivery"("deliveryId");

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DependencySnapshot" ADD CONSTRAINT "DependencySnapshot_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DependencyCandidate" ADD CONSTRAINT "DependencyCandidate_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "DependencySnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageSnapshot" ADD CONSTRAINT "CoverageSnapshot_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageFileMetric" ADD CONSTRAINT "CoverageFileMetric_coverageSnapshotId_fkey" FOREIGN KEY ("coverageSnapshotId") REFERENCES "CoverageSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_resumedFromDeferredUpgradeId_fkey" FOREIGN KEY ("resumedFromDeferredUpgradeId") REFERENCES "DeferredUpgrade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_dependencyCandidateId_fkey" FOREIGN KEY ("dependencyCandidateId") REFERENCES "DependencyCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunStep" ADD CONSTRAINT "RunStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PullRequestRecord" ADD CONSTRAINT "PullRequestRecord_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PullRequestRecord" ADD CONSTRAINT "PullRequestRecord_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeferredUpgrade" ADD CONSTRAINT "DeferredUpgrade_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeferredUpgrade" ADD CONSTRAINT "DeferredUpgrade_originatingRunId_fkey" FOREIGN KEY ("originatingRunId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeferredUpgrade" ADD CONSTRAINT "DeferredUpgrade_prerequisitePrId_fkey" FOREIGN KEY ("prerequisitePrId") REFERENCES "PullRequestRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeferredUpgrade" ADD CONSTRAINT "DeferredUpgrade_dependencyCandidateId_fkey" FOREIGN KEY ("dependencyCandidateId") REFERENCES "DependencyCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationRecord" ADD CONSTRAINT "EvaluationRecord_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

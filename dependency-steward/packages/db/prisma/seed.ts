import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/* ---------- helpers ---------- */

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function hoursAgo(hours: number): Date {
  const d = new Date();
  d.setHours(d.getHours() - hours);
  return d;
}

/* ---------- repo scaffolding ---------- */

interface RepoInput {
  fullName: string;
  owner: string;
  name: string;
  packageManager: "npm" | "pnpm";
  testFramework: "jest" | "vitest";
  healthStatus: "healthy" | "attention" | "critical";
  defaultBranch?: string;
  packageRoot?: string;
  coverageAlertThreshold?: number;
  minRepoCoverage?: number;
}

async function ensureRepository(input: RepoInput) {
  const repoUrl = `https://github.com/${input.fullName}.git`;
  const repository = await prisma.repository.upsert({
    where: { fullName: input.fullName },
    update: {
      packageManager: input.packageManager,
      testFramework: input.testFramework,
      healthStatus: input.healthStatus,
      packageRoot: input.packageRoot ?? null,
      onboardingState: "active",
      repoUrl
    },
    create: {
      owner: input.owner,
      name: input.name,
      fullName: input.fullName,
      repoUrl,
      defaultBranch: input.defaultBranch ?? "main",
      packageRoot: input.packageRoot ?? null,
      packageManager: input.packageManager,
      testFramework: input.testFramework,
      onboardingState: "active",
      healthStatus: input.healthStatus
    }
  });

  const existingPolicy = await prisma.policy.findFirst({
    where: { repositoryId: repository.id },
    orderBy: { updatedAt: "desc" }
  });

  const policy =
    existingPolicy ??
    (await prisma.policy.create({
      data: {
        repositoryId: repository.id,
        minRepoCoverage: input.minRepoCoverage ?? 80,
        minImpactedCoverage: 75,
        coverageAlertThreshold: input.coverageAlertThreshold ?? 70,
        allowedUpgradeKinds: ["patch", "minor", "major"],
        securityOverrideEnabled: true,
        autoCreatePrs: true,
        testBackfillEnabled: true,
        maxRepairAttempts: 2,
        requiredPassingTestRuns: 3,
        coverageSourcePreference: "github_actions",
        coverageWorkflowName: "coverage",
        coverageArtifactName: "coverage-artifact",
        lifecycleScriptsPolicy: "disallow",
        verificationCommands: []
      }
    }));

  await prisma.repository.update({
    where: { id: repository.id },
    data: { activePolicyId: policy.id }
  });

  return { repository, policy };
}

/* ---------- main ---------- */

async function main() {
  /* ---- wipe old seed data so the script is idempotent ---- */
  await prisma.evaluationRecord.deleteMany();
  await prisma.runStep.deleteMany();
  await prisma.artifact.deleteMany();
  await prisma.deferredUpgrade.deleteMany();
  await prisma.pullRequestRecord.deleteMany();
  await prisma.run.deleteMany();
  await prisma.coverageFileMetric.deleteMany();
  await prisma.coverageSnapshot.deleteMany();
  await prisma.dependencyCandidate.deleteMany();
  await prisma.dependencySnapshot.deleteMany();
  await prisma.policy.deleteMany();
  await prisma.repository.deleteMany();

  /* ================================================================
   *  REPO 1 — e-plantShopping  (React / Vite — low coverage, critical)
   * ================================================================ */
  const { repository: ePlant } = await ensureRepository({
    fullName: "intrepidwolf01/e-plantShopping",
    owner: "intrepidwolf01",
    name: "e-plantShopping",
    packageManager: "npm",
    testFramework: "vitest",
    healthStatus: "critical",
    coverageAlertThreshold: 70,
    minRepoCoverage: 80
  });

  // Coverage snapshot — BELOW threshold to show alert
  const ePlantCoverage = await prisma.coverageSnapshot.create({
    data: {
      repositoryId: ePlant.id,
      commitSha: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
      linePct: 42,
      branchPct: 31,
      functionPct: 55,
      statementPct: 44,
      generatedAt: daysAgo(1)
    }
  });

  await prisma.coverageFileMetric.createMany({
    data: [
      { coverageSnapshotId: ePlantCoverage.id, filePath: "src/CartItem.jsx", linePct: 22, branchPct: 10, functionPct: 33, statementPct: 24, uncoveredLines: [14, 18, 22, 35, 41], uncoveredBranches: ["14:0", "35:1"] },
      { coverageSnapshotId: ePlantCoverage.id, filePath: "src/CartSlice.jsx", linePct: 68, branchPct: 50, functionPct: 80, statementPct: 70, uncoveredLines: [28, 44], uncoveredBranches: ["28:0"] },
      { coverageSnapshotId: ePlantCoverage.id, filePath: "src/ProductList.jsx", linePct: 35, branchPct: 20, functionPct: 50, statementPct: 38, uncoveredLines: [10, 25, 30, 45, 60, 72], uncoveredBranches: ["25:0", "45:1"] }
    ]
  });

  // Dependency snapshot
  const ePlantSnap = await prisma.dependencySnapshot.create({
    data: {
      repositoryId: ePlant.id,
      commitSha: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
      manifestPath: "package.json",
      lockfilePath: "package-lock.json",
      packageManager: "npm",
      generatedAt: daysAgo(1)
    }
  });

  // Candidates — real deps from e-plantShopping
  const ePlantCandidates = await Promise.all([
    prisma.dependencyCandidate.create({
      data: {
        snapshotId: ePlantSnap.id,
        packageName: "react",
        currentVersion: "18.2.0",
        targetVersion: "19.1.0",
        kind: "major",
        directness: "direct",
        advisorySeverity: "none",
        riskScore: 72,
        riskTier: "high",
        recommendedAction: "tests-first",
        changelogSummary: "React 19 introduces async transitions, new hooks (use, useFormStatus), and drops legacy context API. Major breaking changes in refs and event handling.",
        status: "manual_review",
        rationale: ["Major version with breaking API changes.", "Coverage on impacted components is below 40%."],
        breakingSignals: ["createRoot API changes", "Ref callback cleanup", "Legacy context removal"]
      }
    }),
    prisma.dependencyCandidate.create({
      data: {
        snapshotId: ePlantSnap.id,
        packageName: "@reduxjs/toolkit",
        currentVersion: "2.2.3",
        targetVersion: "2.8.2",
        kind: "minor",
        directness: "direct",
        advisorySeverity: "none",
        riskScore: 28,
        riskTier: "low",
        recommendedAction: "upgrade-now",
        changelogSummary: "Performance improvements to createSlice selectors and RTK Query cache invalidation. No breaking changes.",
        status: "ready",
        rationale: ["Minor version, no breaking changes.", "Well-tested library with stable API."],
        breakingSignals: []
      }
    }),
    prisma.dependencyCandidate.create({
      data: {
        snapshotId: ePlantSnap.id,
        packageName: "vite",
        currentVersion: "5.2.0",
        targetVersion: "6.3.5",
        kind: "major",
        directness: "direct",
        advisorySeverity: "medium",
        riskScore: 58,
        riskTier: "medium",
        recommendedAction: "tests-first",
        changelogSummary: "Vite 6 changes default dev SSR behavior, requires Node 18+, new Environment API. Advisory: CVE-2025-30208 (arbitrary file read in dev server).",
        status: "ready",
        rationale: ["Security advisory on previous version.", "Major version change needs verification."],
        breakingSignals: ["Node 18+ required", "Environment API changes", "resolve.conditions defaults"]
      }
    }),
    prisma.dependencyCandidate.create({
      data: {
        snapshotId: ePlantSnap.id,
        packageName: "eslint",
        currentVersion: "8.57.0",
        targetVersion: "9.26.0",
        kind: "major",
        directness: "direct",
        advisorySeverity: "none",
        riskScore: 45,
        riskTier: "medium",
        recommendedAction: "tests-first",
        changelogSummary: "ESLint 9 flat config (eslint.config.js) is now default. Legacy .eslintrc format deprecated. Rule API changes.",
        status: "bypassed",
        rationale: ["Configuration format migration required.", "Dev dependency — low runtime risk."],
        breakingSignals: ["Flat config required", ".eslintrc deprecated", "Node 18.18+ required"]
      }
    }),
    prisma.dependencyCandidate.create({
      data: {
        snapshotId: ePlantSnap.id,
        packageName: "react-redux",
        currentVersion: "9.1.1",
        targetVersion: "9.2.0",
        kind: "minor",
        directness: "direct",
        advisorySeverity: "none",
        riskScore: 15,
        riskTier: "low",
        recommendedAction: "upgrade-now",
        changelogSummary: "Added useSelector dev-mode warnings for selector instability. No breaking changes.",
        status: "completed",
        rationale: ["Minor patch with dev mode improvements only."],
        breakingSignals: []
      }
    })
  ]);

  // Runs for e-plantShopping
  const ePlantScan = await prisma.run.create({
    data: {
      repositoryId: ePlant.id,
      runType: "scan",
      triggerSource: "scheduled",
      status: "succeeded",
      baseBranch: "main",
      baseSha: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
      correlationId: "scan-eplant-001",
      summary: "Dependency scan completed — 5 candidates identified",
      startedAt: daysAgo(1),
      endedAt: daysAgo(1)
    }
  });

  const ePlantBackfill = await prisma.run.create({
    data: {
      repositoryId: ePlant.id,
      dependencyCandidateId: ePlantCandidates[0].id,
      runType: "test_backfill",
      triggerSource: "manual",
      status: "awaiting_manual_review",
      baseBranch: "main",
      baseSha: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
      correlationId: "backfill-eplant-react-001",
      summary: "Test backfill for React 19 upgrade — coverage too low to proceed",
      blockingReason: "Line coverage on impacted files (CartItem.jsx, ProductList.jsx) is 22% and 35%, well below the 75% impacted threshold. Generated 3 test files but 1 test is failing.",
      startedAt: hoursAgo(6),
      endedAt: hoursAgo(5)
    }
  });

  const ePlantUpgrade = await prisma.run.create({
    data: {
      repositoryId: ePlant.id,
      dependencyCandidateId: ePlantCandidates[1].id,
      runType: "upgrade",
      triggerSource: "scheduled",
      status: "succeeded",
      baseBranch: "main",
      baseSha: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
      correlationId: "upgrade-eplant-rtk-001",
      summary: "@reduxjs/toolkit 2.2.3 → 2.8.2 upgrade completed, PR created",
      startedAt: hoursAgo(4),
      endedAt: hoursAgo(3)
    }
  });

  const ePlantViteRun = await prisma.run.create({
    data: {
      repositoryId: ePlant.id,
      dependencyCandidateId: ePlantCandidates[2].id,
      runType: "test_backfill",
      triggerSource: "scheduled",
      status: "running",
      baseBranch: "main",
      baseSha: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
      correlationId: "backfill-eplant-vite-001",
      summary: "Test backfill for vite 6.3.5 upgrade — generating tests",
      startedAt: hoursAgo(1)
    }
  });

  // Run steps for the backfill run
  await prisma.runStep.createMany({
    data: [
      { runId: ePlantBackfill.id, stepKey: "clone_repo", status: "succeeded", startedAt: hoursAgo(6), endedAt: hoursAgo(6) },
      { runId: ePlantBackfill.id, stepKey: "baseline_coverage", status: "succeeded", startedAt: hoursAgo(6), endedAt: hoursAgo(6) },
      { runId: ePlantBackfill.id, stepKey: "generate_tests", status: "succeeded", startedAt: hoursAgo(6), endedAt: hoursAgo(5) },
      { runId: ePlantBackfill.id, stepKey: "run_tests", status: "failed", startedAt: hoursAgo(5), endedAt: hoursAgo(5), errorCode: "TEST_FAILURE" },
      { runId: ePlantBackfill.id, stepKey: "evaluate", status: "blocked", startedAt: hoursAgo(5), endedAt: hoursAgo(5) }
    ]
  });

  // PRs for e-plantShopping
  await prisma.pullRequestRecord.createMany({
    data: [
      {
        repositoryId: ePlant.id,
        runId: ePlantUpgrade.id,
        githubPrNumber: 14,
        title: "chore(deps): upgrade @reduxjs/toolkit 2.2.3 → 2.8.2",
        url: "https://github.com/intrepidwolf01/e-plantShopping/pull/14",
        branchName: "steward/upgrade-reduxjs-toolkit-2.8.2",
        prType: "dependency_upgrade",
        status: "open"
      },
      {
        repositoryId: ePlant.id,
        runId: ePlantBackfill.id,
        githubPrNumber: 13,
        title: "test: backfill tests for CartItem, CartSlice, ProductList",
        url: "https://github.com/intrepidwolf01/e-plantShopping/pull/13",
        branchName: "steward/test-backfill-react-19",
        prType: "test_backfill",
        status: "draft"
      },
      {
        repositoryId: ePlant.id,
        runId: ePlantScan.id,
        githubPrNumber: 12,
        title: "chore(deps): upgrade react-redux 9.1.1 → 9.2.0",
        url: "https://github.com/intrepidwolf01/e-plantShopping/pull/12",
        branchName: "steward/upgrade-react-redux-9.2.0",
        prType: "dependency_upgrade",
        status: "merged",
        mergedAt: daysAgo(2),
        mergeCommitSha: "f4c9e1a8823d5b6c7e08f91a2b34c567d890ef12"
      }
    ]
  });

  // Evaluation for the succeeded upgrade run
  await prisma.evaluationRecord.create({
    data: {
      run: { connect: { id: ePlantUpgrade.id } },
      coverageDelta: 0.0,
      passedVerification: true,
      flakeDetected: false,
      generatedFilesCount: 0,
      acceptedByHuman: false
    }
  });

  /* ================================================================
   *  REPO 2 — fullstack_developer_capstone  (Node/Express — attention)
   * ================================================================ */

  const { repository: capstone } = await ensureRepository({
    fullName: "intrepidwolf01/fullstack_developer_capstone",
    owner: "intrepidwolf01",
    name: "fullstack_developer_capstone",
    packageManager: "npm",
    testFramework: "jest",
    healthStatus: "attention",
    packageRoot: "server/frontend",
    coverageAlertThreshold: 70,
    minRepoCoverage: 80
  });

  // Coverage snapshot — slightly below threshold
  const capstoneCoverage = await prisma.coverageSnapshot.create({
    data: {
      repositoryId: capstone.id,
      commitSha: "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3",
      linePct: 64,
      branchPct: 52,
      functionPct: 71,
      statementPct: 66,
      generatedAt: daysAgo(2)
    }
  });

  await prisma.coverageFileMetric.createMany({
    data: [
      { coverageSnapshotId: capstoneCoverage.id, filePath: "server/routes/auth.js", linePct: 80, branchPct: 65, functionPct: 90, statementPct: 82, uncoveredLines: [44, 67], uncoveredBranches: ["44:0"] },
      { coverageSnapshotId: capstoneCoverage.id, filePath: "server/routes/dealers.js", linePct: 55, branchPct: 40, functionPct: 60, statementPct: 57, uncoveredLines: [20, 35, 48, 62, 78], uncoveredBranches: ["20:0", "48:1"] },
      { coverageSnapshotId: capstoneCoverage.id, filePath: "server/app.js", linePct: 72, branchPct: 60, functionPct: 85, statementPct: 74, uncoveredLines: [15, 30], uncoveredBranches: [] }
    ]
  });

  // Dependency snapshot
  const capstoneSnap = await prisma.dependencySnapshot.create({
    data: {
      repositoryId: capstone.id,
      commitSha: "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3",
      manifestPath: "server/package.json",
      lockfilePath: "server/package-lock.json",
      packageManager: "npm",
      generatedAt: daysAgo(2)
    }
  });

  const capstoneCandidates = await Promise.all([
    prisma.dependencyCandidate.create({
      data: {
        snapshotId: capstoneSnap.id,
        packageName: "express",
        currentVersion: "4.18.2",
        targetVersion: "5.1.0",
        kind: "major",
        directness: "direct",
        advisorySeverity: "high",
        riskScore: 85,
        riskTier: "high",
        recommendedAction: "tests-first",
        changelogSummary: "Express 5 removes deprecated middleware, changes path matching semantics, requires Node 18+. Advisory: CVE-2024-29041 (open redirect in older express).",
        status: "ready",
        rationale: ["Security advisory on express 4.x.", "Major version with path routing changes.", "Coverage on route handlers is 55%."],
        breakingSignals: ["res.redirect() signature changed", "Path route matching stricter", "Removed req.host trust proxy behavior"]
      }
    }),
    prisma.dependencyCandidate.create({
      data: {
        snapshotId: capstoneSnap.id,
        packageName: "mongoose",
        currentVersion: "7.6.3",
        targetVersion: "8.14.3",
        kind: "major",
        directness: "direct",
        advisorySeverity: "none",
        riskScore: 62,
        riskTier: "medium",
        recommendedAction: "tests-first",
        changelogSummary: "Mongoose 8 drops callback support, requires Node 16+, changes default strictQuery to false. Schema type casting behavior modified.",
        status: "ready",
        rationale: ["Major version removes callback API.", "Query behavior changes may break existing patterns."],
        breakingSignals: ["No more callbacks", "strictQuery default false", "ObjectId casting changes"]
      }
    }),
    prisma.dependencyCandidate.create({
      data: {
        snapshotId: capstoneSnap.id,
        packageName: "jsonwebtoken",
        currentVersion: "9.0.0",
        targetVersion: "9.0.2",
        kind: "patch",
        directness: "direct",
        advisorySeverity: "critical",
        riskScore: 38,
        riskTier: "low",
        recommendedAction: "upgrade-now",
        changelogSummary: "Patches CVE-2024-33883: prototype pollution in jwt.verify(). Drop-in fix, no API changes.",
        status: "identified",
        rationale: ["Critical severity CVE.", "Patch version — no breaking changes."],
        breakingSignals: []
      }
    }),
    prisma.dependencyCandidate.create({
      data: {
        snapshotId: capstoneSnap.id,
        packageName: "cors",
        currentVersion: "2.8.5",
        targetVersion: "2.8.6",
        kind: "patch",
        directness: "direct",
        advisorySeverity: "low",
        riskScore: 8,
        riskTier: "low",
        recommendedAction: "upgrade-now",
        changelogSummary: "Bug fix for Access-Control-Allow-Headers handling with multiple values. No breaking changes.",
        status: "completed",
        rationale: ["Trivial patch, well-tested."],
        breakingSignals: []
      }
    })
  ]);

  // Runs for capstone
  const capstoneScan = await prisma.run.create({
    data: {
      repositoryId: capstone.id,
      runType: "scan",
      triggerSource: "scheduled",
      status: "succeeded",
      baseBranch: "main",
      baseSha: "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3",
      correlationId: "scan-capstone-001",
      summary: "Dependency scan completed — 4 candidates identified",
      startedAt: daysAgo(2),
      endedAt: daysAgo(2)
    }
  });

  const capstoneJwtRun = await prisma.run.create({
    data: {
      repositoryId: capstone.id,
      dependencyCandidateId: capstoneCandidates[2].id,
      runType: "upgrade",
      triggerSource: "scheduled",
      status: "queued",
      baseBranch: "main",
      baseSha: "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3",
      correlationId: "upgrade-capstone-jwt-001",
      summary: "Queued: jsonwebtoken 9.0.0 → 9.0.2 (critical CVE patch)",
      startedAt: hoursAgo(2)
    }
  });

  const capstoneExpressRun = await prisma.run.create({
    data: {
      repositoryId: capstone.id,
      dependencyCandidateId: capstoneCandidates[0].id,
      runType: "test_backfill",
      triggerSource: "manual",
      status: "waiting_for_followup",
      baseBranch: "main",
      baseSha: "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3",
      correlationId: "backfill-capstone-express-001",
      summary: "Test backfill for Express 5 migration — waiting for test-backfill PR to merge",
      blockingReason: "Prerequisite PR #8 (test backfill) must be merged before the upgrade can proceed.",
      startedAt: daysAgo(1),
      endedAt: hoursAgo(12)
    }
  });

  const capstoneCorsRun = await prisma.run.create({
    data: {
      repositoryId: capstone.id,
      dependencyCandidateId: capstoneCandidates[3].id,
      runType: "upgrade",
      triggerSource: "scheduled",
      status: "succeeded",
      baseBranch: "main",
      baseSha: "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3",
      correlationId: "upgrade-capstone-cors-001",
      summary: "cors 2.8.5 → 2.8.6 upgrade completed, PR merged",
      startedAt: daysAgo(3),
      endedAt: daysAgo(3)
    }
  });

  // Run steps for express backfill
  await prisma.runStep.createMany({
    data: [
      { runId: capstoneExpressRun.id, stepKey: "clone_repo", status: "succeeded", startedAt: daysAgo(1), endedAt: daysAgo(1) },
      { runId: capstoneExpressRun.id, stepKey: "baseline_coverage", status: "succeeded", startedAt: daysAgo(1), endedAt: daysAgo(1) },
      { runId: capstoneExpressRun.id, stepKey: "generate_tests", status: "succeeded", startedAt: daysAgo(1), endedAt: daysAgo(1) },
      { runId: capstoneExpressRun.id, stepKey: "run_tests", status: "succeeded", startedAt: daysAgo(1), endedAt: daysAgo(1) },
      { runId: capstoneExpressRun.id, stepKey: "create_pr", status: "succeeded", startedAt: daysAgo(1), endedAt: daysAgo(1) },
      { runId: capstoneExpressRun.id, stepKey: "wait_for_merge", status: "in_progress", startedAt: hoursAgo(12) }
    ]
  });

  // PRs for capstone
  const capstoneTestPr = await prisma.pullRequestRecord.create({
    data: {
      repositoryId: capstone.id,
      runId: capstoneExpressRun.id,
      githubPrNumber: 8,
      title: "test: backfill route handler tests for Express 5 migration",
      url: "https://github.com/intrepidwolf01/fullstack_developer_capstone/pull/8",
      branchName: "steward/test-backfill-express-5",
      prType: "test_backfill",
      status: "open"
    }
  });

  await prisma.pullRequestRecord.create({
    data: {
      repositoryId: capstone.id,
      runId: capstoneCorsRun.id,
      githubPrNumber: 7,
      title: "chore(deps): upgrade cors 2.8.5 → 2.8.6",
      url: "https://github.com/intrepidwolf01/fullstack_developer_capstone/pull/7",
      branchName: "steward/upgrade-cors-2.8.6",
      prType: "dependency_upgrade",
      status: "merged",
      mergedAt: daysAgo(2),
      mergeCommitSha: "e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3"
    }
  });

  // Evaluations
  await prisma.evaluationRecord.create({
    data: {
      run: { connect: { id: capstoneCorsRun.id } },
      coverageDelta: 0.2,
      passedVerification: true,
      flakeDetected: false,
      generatedFilesCount: 0,
      acceptedByHuman: true
    }
  });

  // Deferred upgrade (Express waiting on test-backfill PR)
  await prisma.deferredUpgrade.create({
    data: {
      repository: { connect: { id: capstone.id } },
      originatingRun: { connect: { id: capstoneExpressRun.id } },
      prerequisitePr: { connect: { id: capstoneTestPr.id } },
      dependencyCandidate: { connect: { id: capstoneCandidates[0].id } },
      packageName: "express",
      targetVersion: "5.1.0",
      originBaseSha: "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3",
      policyVersion: "1",
      status: "pending"
    }
  });

  /* ================================================================
   *  REPO 3 — rag-qa-bot  (Python — healthy, high coverage)
   * ================================================================ */
  const { repository: ragBot } = await ensureRepository({
    fullName: "intrepidwolf01/rag-qa-bot",
    owner: "intrepidwolf01",
    name: "rag-qa-bot",
    packageManager: "npm",
    testFramework: "jest",
    healthStatus: "healthy",
    coverageAlertThreshold: 80,
    minRepoCoverage: 85
  });

  // Coverage — above threshold
  await prisma.coverageSnapshot.create({
    data: {
      repositoryId: ragBot.id,
      commitSha: "c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
      linePct: 88,
      branchPct: 82,
      functionPct: 91,
      statementPct: 87,
      generatedAt: daysAgo(1)
    }
  });

  // Dependency snapshot
  const ragSnap = await prisma.dependencySnapshot.create({
    data: {
      repositoryId: ragBot.id,
      commitSha: "c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
      manifestPath: "package.json",
      lockfilePath: "package-lock.json",
      packageManager: "npm",
      generatedAt: daysAgo(1)
    }
  });

  const ragCandidates = await Promise.all([
    prisma.dependencyCandidate.create({
      data: {
        snapshotId: ragSnap.id,
        packageName: "langchain",
        currentVersion: "0.2.16",
        targetVersion: "0.3.22",
        kind: "minor",
        directness: "direct",
        advisorySeverity: "none",
        riskScore: 35,
        riskTier: "medium",
        recommendedAction: "tests-first",
        changelogSummary: "LangChain 0.3 removes deprecated document loader APIs, adds structured output support. Requires langchain-core 0.3+.",
        status: "ready",
        rationale: ["Pre-1.0 minor that acts like major.", "Good test coverage — backfill minimal."],
        breakingSignals: ["Document loader API changed", "langchain-core peer dep"]
      }
    }),
    prisma.dependencyCandidate.create({
      data: {
        snapshotId: ragSnap.id,
        packageName: "chromadb",
        currentVersion: "1.9.0",
        targetVersion: "1.9.2",
        kind: "patch",
        directness: "direct",
        advisorySeverity: "none",
        riskScore: 10,
        riskTier: "low",
        recommendedAction: "upgrade-now",
        changelogSummary: "Bug fix for metadata filtering with nested $and/$or operators. Performance improvements for large collections.",
        status: "completed",
        rationale: ["Patch version, no API changes."],
        breakingSignals: []
      }
    })
  ]);

  // Runs for rag-qa-bot
  const ragScan = await prisma.run.create({
    data: {
      repositoryId: ragBot.id,
      runType: "scan",
      triggerSource: "webhook",
      status: "succeeded",
      baseBranch: "main",
      baseSha: "c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
      correlationId: "scan-rag-001",
      summary: "Dependency scan completed — 2 candidates identified",
      startedAt: daysAgo(1),
      endedAt: daysAgo(1)
    }
  });

  const ragChromaRun = await prisma.run.create({
    data: {
      repositoryId: ragBot.id,
      dependencyCandidateId: ragCandidates[1].id,
      runType: "upgrade",
      triggerSource: "scheduled",
      status: "succeeded",
      baseBranch: "main",
      baseSha: "c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
      correlationId: "upgrade-rag-chroma-001",
      summary: "chromadb 1.9.0 → 1.9.2 upgrade completed, PR merged",
      startedAt: daysAgo(1),
      endedAt: hoursAgo(18)
    }
  });

  const ragLangchainRun = await prisma.run.create({
    data: {
      repositoryId: ragBot.id,
      dependencyCandidateId: ragCandidates[0].id,
      runType: "test_backfill",
      triggerSource: "scheduled",
      status: "succeeded",
      baseBranch: "main",
      baseSha: "c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
      correlationId: "backfill-rag-langchain-001",
      summary: "Test backfill for langchain 0.3 — all generated tests passing",
      startedAt: hoursAgo(10),
      endedAt: hoursAgo(8)
    }
  });

  // PRs for rag-qa-bot
  await prisma.pullRequestRecord.createMany({
    data: [
      {
        repositoryId: ragBot.id,
        runId: ragLangchainRun.id,
        githubPrNumber: 5,
        title: "test: backfill QA chain and retriever tests for langchain 0.3",
        url: "https://github.com/intrepidwolf01/rag-qa-bot/pull/5",
        branchName: "steward/test-backfill-langchain-0.3",
        prType: "test_backfill",
        status: "open"
      },
      {
        repositoryId: ragBot.id,
        runId: ragChromaRun.id,
        githubPrNumber: 4,
        title: "chore(deps): upgrade chromadb 1.9.0 → 1.9.2",
        url: "https://github.com/intrepidwolf01/rag-qa-bot/pull/4",
        branchName: "steward/upgrade-chromadb-1.9.2",
        prType: "dependency_upgrade",
        status: "merged",
        mergedAt: hoursAgo(16),
        mergeCommitSha: "d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4"
      }
    ]
  });

  // Evaluations
  await prisma.evaluationRecord.create({
    data: {
      run: { connect: { id: ragChromaRun.id } },
      coverageDelta: 0.0,
      passedVerification: true,
      flakeDetected: false,
      generatedFilesCount: 0,
      acceptedByHuman: true
    }
  });

  await prisma.evaluationRecord.create({
    data: {
      run: { connect: { id: ragLangchainRun.id } },
      coverageDelta: 4.2,
      passedVerification: true,
      flakeDetected: false,
      generatedFilesCount: 3,
      acceptedByHuman: false
    }
  });

  // Artifacts
  await prisma.artifact.createMany({
    data: [
      { runId: ePlantBackfill.id, artifactType: "log", storageKey: "runs/eplant-backfill/log.txt", contentType: "text/plain", byteSize: 24500 },
      { runId: ePlantBackfill.id, artifactType: "coverage", storageKey: "runs/eplant-backfill/coverage.json", contentType: "application/json", byteSize: 8200 },
      { runId: capstoneExpressRun.id, artifactType: "log", storageKey: "runs/capstone-express/log.txt", contentType: "text/plain", byteSize: 31200 },
      { runId: capstoneExpressRun.id, artifactType: "patch", storageKey: "runs/capstone-express/tests.patch", contentType: "text/x-patch", byteSize: 12400 },
      { runId: ragLangchainRun.id, artifactType: "summary", storageKey: "runs/rag-langchain/summary.md", contentType: "text/markdown", byteSize: 3800 },
      { runId: ragLangchainRun.id, artifactType: "coverage", storageKey: "runs/rag-langchain/coverage.json", contentType: "application/json", byteSize: 6100 }
    ]
  });

  console.log("Seeded Dependency Steward demo data:");
  console.log(`  3 repositories (e-plantShopping [critical], fullstack_developer_capstone [attention], rag-qa-bot [healthy])`);
  console.log(`  11 dependency candidates (various statuses: ready, manual_review, bypassed, completed, identified)`);
  console.log(`  10 runs (succeeded, running, queued, awaiting_manual_review, waiting_for_followup)`);
  console.log(`  7 pull requests (open, merged, draft)`);
  console.log(`  3 coverage snapshots (42%, 64%, 88%)`);
  console.log(`  6 artifacts, 11 run steps, 1 deferred upgrade, 3 evaluations`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
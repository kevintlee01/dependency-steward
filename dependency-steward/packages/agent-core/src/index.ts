import type { CoverageFileMetric } from "@dependency-steward/shared";
import {
  type DependencyCandidate,
  type ManualReviewRecord,
  type PolicyDecision,
  type PolicyRecord,
  type RepositoryRecord,
  slugify
} from "@dependency-steward/shared";
import { evaluatePolicy } from "@dependency-steward/policy-engine";
import {
  buildPrSummaryPrompt,
  buildTestPlanPrompt,
  createLlmClient,
  type LlmClient
} from "@dependency-steward/prompt-kit";

export interface TestPlanResult {
  targetFiles: string[];
  scenarioList: string[];
  helperUsage: string[];
  expectedCoverageAreas: string[];
}

export interface PullRequestComposition {
  title: string;
  summary: string;
  bulletPoints: string[];
  reviewerFocus: string[];
  knownRisks: string[];
}

export interface CandidateRoutingContext {
  repository: RepositoryRecord;
  policy: PolicyRecord;
  candidate: DependencyCandidate;
  repositorySupported: boolean;
  coverageAvailable: boolean;
  repositoryCoverage?: number | null;
  impactedCoverage?: number | null;
  impactedMappingConfidence: "high" | "low";
}

export class DependencyStewardOrchestrator {
  private readonly llmClient: LlmClient;

  constructor(llmClient: LlmClient = createLlmClient()) {
    this.llmClient = llmClient;
  }

  routeCandidate(context: CandidateRoutingContext): PolicyDecision {
    return evaluatePolicy({
      repositorySupported: context.repositorySupported,
      coverageAvailable: context.coverageAvailable,
      impactedMappingConfidence: context.impactedMappingConfidence,
      riskTier: context.candidate.riskTier,
      dependencyKind: context.candidate.kind,
      advisorySeverity: context.candidate.advisorySeverity,
      repositoryCoverage: context.repositoryCoverage,
      impactedCoverage: context.impactedCoverage,
      policy: context.policy
    });
  }

  async buildTestPlan(input: {
    repository: RepositoryRecord;
    candidate: DependencyCandidate;
    lowCoverageMetrics: CoverageFileMetric[];
  }): Promise<TestPlanResult> {
    const fallback: TestPlanResult = {
      targetFiles: input.lowCoverageMetrics.slice(0, 3).map((metric) => metric.filePath),
      scenarioList: [
        `Add deterministic unit coverage around ${input.candidate.packageName} adapter boundaries.`,
        "Cover error handling paths that would protect the upgrade.",
        "Cover success cases that exercise the current exported API surface."
      ],
      helperUsage: ["Reuse existing local test helpers when possible."],
      expectedCoverageAreas: input.lowCoverageMetrics.slice(0, 3).map((metric) => metric.filePath)
    };

    try {
      return await this.llmClient.generateStructured<TestPlanResult>({
        systemPrompt: "You are Dependency Steward. Produce deterministic, repository-aligned unit test plans.",
        userPrompt: buildTestPlanPrompt({
          repository: input.repository,
          candidate: input.candidate,
          lowCoverageFiles: fallback.targetFiles
        }),
        temperature: 0.1
      });
    } catch {
      return fallback;
    }
  }

  async composePullRequest(input: {
    repository: RepositoryRecord;
    policy: PolicyRecord;
    candidate: DependencyCandidate;
    verificationSummary: string;
  }): Promise<PullRequestComposition> {
    const fallback: PullRequestComposition = {
      title: `chore(deps): upgrade ${input.candidate.packageName} to ${input.candidate.targetVersion}`,
      summary: `Automated ${input.candidate.kind} dependency update for ${input.candidate.packageName}.`,
      bulletPoints: input.candidate.rationale,
      reviewerFocus: [
        `Review impacted adapter and integration points for ${input.candidate.packageName}.`,
        "Confirm verification output and policy rationale match repository expectations."
      ],
      knownRisks: input.candidate.breakingSignals
    };

    try {
      return await this.llmClient.generateStructured<PullRequestComposition>({
        systemPrompt: "You are Dependency Steward. Compose concise, reviewable engineering pull requests.",
        userPrompt: buildPrSummaryPrompt(input),
        temperature: 0.2
      });
    } catch {
      return fallback;
    }
  }

  buildBranchName(candidate: DependencyCandidate, mode: "upgrade" | "tests", runId: string): string {
    if (mode === "tests") {
      return `ds/tests/${runId}/${slugify(candidate.packageName)}`;
    }

    return `ds/upgrade/${slugify(candidate.packageName)}/${slugify(candidate.targetVersion)}`;
  }

  buildManualReview(reason: ManualReviewRecord): string {
    return `${reason.message} Next action: ${reason.nextAction}`;
  }
}
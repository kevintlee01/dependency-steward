import {
  type PolicyDecision,
  type PolicyEvaluationInput
} from "@dependency-steward/shared";

function makeManualReview(reasonCode: string, message: string, nextAction: string): PolicyDecision {
  return {
    action: "manual-review",
    reason: message,
    securityOverrideApplied: false,
    priority: "normal",
    manualReview: {
      reasonCode,
      message,
      nextAction
    }
  };
}

export function evaluatePolicy(input: PolicyEvaluationInput): PolicyDecision {
  if (!input.repositorySupported) {
    return makeManualReview(
      "unsupported_repository",
      "Unsupported repository configuration for the current MVP support matrix.",
      "Confirm the package manager, test framework, and coverage setup match the supported matrix."
    );
  }

  const securityOverrideApplied =
    input.policy.securityOverrideEnabled && ["high", "critical"].includes(input.advisorySeverity);

  if (!input.policy.allowedUpgradeKinds.includes(input.dependencyKind) && !securityOverrideApplied) {
    return makeManualReview(
      "blocked_upgrade_kind",
      "The dependency upgrade kind is blocked by policy.",
      "Adjust the allowed upgrade kinds or manually trigger a reviewed exception."
    );
  }

  if (!input.coverageAvailable) {
    return makeManualReview(
      "coverage_unavailable",
      "Coverage could not be resolved for this repository state.",
      "Configure GitHub Actions coverage artifacts or worker-generated coverage commands."
    );
  }

  if (input.impactedMappingConfidence === "low") {
    return makeManualReview(
      "low_impacted_confidence",
      "Impacted module mapping is too weak for an explainable automated decision.",
      "Review the candidate manually or improve repository import boundaries."
    );
  }

  const impactedBelowThreshold =
    typeof input.impactedCoverage === "number" && input.impactedCoverage < input.policy.minImpactedCoverage;

  const repoBelowThreshold =
    typeof input.repositoryCoverage === "number" && input.repositoryCoverage < input.policy.minRepoCoverage;

  if ((input.riskTier === "medium" || input.riskTier === "high") && (impactedBelowThreshold || repoBelowThreshold)) {
    if (input.policy.testBackfillEnabled && input.dependencyKind !== "major") {
      return {
        action: "tests-first",
        reason: "Coverage gates are below threshold for a non-trivial dependency risk tier.",
        securityOverrideApplied,
        priority: securityOverrideApplied ? "elevated" : "normal"
      };
    }

    return makeManualReview(
      "coverage_below_threshold",
      "Coverage is below policy threshold and automated test backfill is disabled or unsuitable.",
      "Raise coverage manually or adjust the repository policy before retrying the upgrade."
    );
  }

  return {
    action: "upgrade-now",
    reason: securityOverrideApplied
      ? "Security override elevated the candidate but all safety gates still passed."
      : "Coverage and policy gates passed for this candidate.",
    securityOverrideApplied,
    priority: securityOverrideApplied ? "elevated" : "normal"
  };
}
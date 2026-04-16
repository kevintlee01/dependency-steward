import { access, readFile } from "node:fs/promises";
import path from "node:path";

import {
  type AdvisorySeverity,
  type DependencyCandidate,
  type DependencyDirectness,
  type DependencyKind,
  type PackageManager,
  type RiskTier,
  createId,
  slugify
} from "@dependency-steward/shared";

interface PackageManifest {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface PackageMetadata {
  latestVersion: string;
  releaseNotesUrl?: string;
  publishedAt?: string;
}

const severityWeight: Record<AdvisorySeverity, number> = {
  none: 0,
  low: 5,
  medium: 10,
  high: 18,
  critical: 20
};

function cleanSemver(value: string): string {
  return value.replace(/^[\^~><= ]+/, "").trim();
}

function parseSemver(value: string): [number, number, number] {
  const cleaned = cleanSemver(value).replace(/-.+$/, "");
  const [major = "0", minor = "0", patch = "0"] = cleaned.split(".");
  return [Number(major), Number(minor), Number(patch)];
}

export function classifySemverJump(currentVersion: string, targetVersion: string): DependencyKind {
  const [currentMajor, currentMinor] = parseSemver(currentVersion);
  const [targetMajor, targetMinor] = parseSemver(targetVersion);

  if (targetMajor > currentMajor) {
    return "major";
  }

  if (targetMinor > currentMinor) {
    return "minor";
  }

  return "patch";
}

export async function detectPackageManager(rootDir: string): Promise<PackageManager> {
  const checks: Array<[PackageManager, string]> = [
    ["pnpm", "pnpm-lock.yaml"],
    ["npm", "package-lock.json"]
  ];

  for (const [packageManager, fileName] of checks) {
    try {
      await access(path.join(rootDir, fileName));
      return packageManager;
    } catch {
      continue;
    }
  }

  return "unknown";
}

export async function inferTestFramework(rootDir: string): Promise<"jest" | "vitest" | "mocha" | "none" | "unknown"> {
  const manifest = await loadManifest(rootDir);
  const dependencies = {
    ...manifest.dependencies,
    ...manifest.devDependencies
  };

  if (dependencies.vitest) {
    return "vitest";
  }

  if (dependencies.jest || dependencies["ts-jest"] || dependencies["@jest/core"] || dependencies["react-scripts"] || dependencies["@testing-library/jest-dom"]) {
    return "jest";
  }

  if (dependencies.mocha) {
    return "mocha";
  }

  const configFiles = [
    "vitest.config.ts", "vitest.config.js", "vitest.config.mts",
    "jest.config.ts", "jest.config.js", "jest.config.mjs", "jest.config.cjs"
  ];
  for (const configFile of configFiles) {
    try {
      await access(path.join(rootDir, configFile));
      return configFile.startsWith("vitest") ? "vitest" : "jest";
    } catch {
      continue;
    }
  }

  const scripts = (manifest as Record<string, unknown> & { scripts?: Record<string, string> }).scripts ?? {};
  for (const scriptValue of Object.values(scripts)) {
    if (/vitest/i.test(scriptValue)) return "vitest";
    if (/jest/i.test(scriptValue)) return "jest";
    if (/mocha/i.test(scriptValue)) return "mocha";
  }

  const hasTestScript = Boolean(scripts.test);
  if (!hasTestScript) {
    return "none";
  }

  return "unknown";
}

export async function loadManifest(rootDir: string): Promise<PackageManifest> {
  const packageJsonPath = path.join(rootDir, "package.json");
  const raw = JSON.parse(await readFile(packageJsonPath, "utf8")) as PackageManifest;

  return raw;
}

export async function fetchPackageMetadata(packageName: string): Promise<PackageMetadata | null> {
  const response = await fetch(`https://registry.npmjs.org/${packageName}`);

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    "dist-tags"?: { latest?: string };
    homepage?: string;
    time?: Record<string, string>;
  };

  const latestVersion = payload["dist-tags"]?.latest;
  if (!latestVersion) {
    return null;
  }

  return {
    latestVersion,
    releaseNotesUrl: payload.homepage,
    publishedAt: payload.time?.[latestVersion]
  };
}

export async function fetchOsvSeverity(packageName: string, currentVersion: string): Promise<AdvisorySeverity> {
  const response = await fetch("https://api.osv.dev/v1/query", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      package: {
        name: packageName,
        ecosystem: "npm"
      },
      version: cleanSemver(currentVersion)
    })
  });

  if (!response.ok) {
    return "none";
  }

  const payload = (await response.json()) as {
    vulns?: Array<{
      severity?: Array<{ type: string; score: string }>;
      database_specific?: { severity?: string };
    }>;
  };

  const declared = payload.vulns?.map((vulnerability) => vulnerability.database_specific?.severity?.toLowerCase());
  if (declared?.includes("critical")) {
    return "critical";
  }

  if (declared?.includes("high")) {
    return "high";
  }

  if (declared?.includes("medium")) {
    return "medium";
  }

  if (declared?.includes("low")) {
    return "low";
  }

  return "none";
}

export function scoreDependencyRisk(input: {
  currentVersion: string;
  targetVersion: string;
  advisorySeverity: AdvisorySeverity;
  impactedCoverage?: number | null;
  testInstabilityPenalty?: number;
  criticalityPenalty?: number;
}): { score: number; tier: RiskTier; rationale: string[]; breakingSignals: string[] } {
  const kind = classifySemverJump(input.currentVersion, input.targetVersion);
  const rationale: string[] = [];
  const breakingSignals: string[] = [];

  let score = kind === "major" ? 25 : kind === "minor" ? 12 : 4;
  rationale.push(`Semver change classified as ${kind}.`);

  score += severityWeight[input.advisorySeverity];
  if (input.advisorySeverity !== "none") {
    rationale.push(`Security advisory severity is ${input.advisorySeverity}.`);
  }

  if (typeof input.impactedCoverage === "number" && input.impactedCoverage < 75) {
    score += 12;
    rationale.push(`Impacted coverage is ${input.impactedCoverage}%, below the default confidence threshold.`);
  }

  if (input.testInstabilityPenalty) {
    score += input.testInstabilityPenalty;
    breakingSignals.push("Historical test instability detected.");
  }

  if (input.criticalityPenalty) {
    score += input.criticalityPenalty;
    rationale.push("Dependency is considered critical in the repository graph.");
  }

  const tier: RiskTier = score >= 60 ? "high" : score >= 30 ? "medium" : "low";
  return {
    score,
    tier,
    rationale,
    breakingSignals
  };
}

export async function buildDependencyCandidates(input: {
  rootDir: string;
  snapshotId: string;
  impactedCoverage?: number | null;
}): Promise<DependencyCandidate[]> {
  const manifest = await loadManifest(input.rootDir);
  const dependencyEntries: Array<[string, string, DependencyDirectness]> = [
    ...Object.entries(manifest.dependencies ?? {}).map(([name, version]) => [name, version, "direct"] as const),
    ...Object.entries(manifest.devDependencies ?? {}).map(([name, version]) => [name, version, "direct"] as const)
  ];

  const candidates: DependencyCandidate[] = [];

  for (const [packageName, currentVersion, directness] of dependencyEntries) {
    let metadata: PackageMetadata | null = null;
    let advisorySeverity: AdvisorySeverity = "none";

    try {
      metadata = await fetchPackageMetadata(packageName);
      advisorySeverity = await fetchOsvSeverity(packageName, currentVersion);
    } catch {
      metadata = null;
      advisorySeverity = "none";
    }

    if (!metadata || cleanSemver(metadata.latestVersion) === cleanSemver(currentVersion)) {
      continue;
    }

    const kind = classifySemverJump(currentVersion, metadata.latestVersion);
    const risk = scoreDependencyRisk({
      currentVersion,
      targetVersion: metadata.latestVersion,
      advisorySeverity,
      impactedCoverage: input.impactedCoverage
    });

    candidates.push({
      id: `${slugify(packageName)}-${createId()}`,
      snapshotId: input.snapshotId,
      packageName,
      currentVersion,
      targetVersion: metadata.latestVersion,
      kind,
      directness,
      advisorySeverity,
      riskScore: risk.score,
      riskTier: risk.tier,
      recommendedAction: risk.tier === "high" ? "tests-first" : "upgrade-now",
      changelogSummary: metadata.releaseNotesUrl
        ? `Latest published release available via ${metadata.releaseNotesUrl}.`
        : `Registry metadata indicates ${metadata.latestVersion} was published ${metadata.publishedAt ?? "recently"}.`,
      status: risk.tier === "high" ? "deferred" : "ready",
      rationale: risk.rationale,
      breakingSignals: risk.breakingSignals
    });
  }

  return candidates.sort((left, right) => right.riskScore - left.riskScore);
}
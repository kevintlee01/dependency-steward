import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import {
  type CoverageFileMetric,
  type CoverageSnapshotRecord,
  createId,
  nowIso
} from "@dependency-steward/shared";

interface MutableCoverageState {
  filePath: string;
  foundLines: number;
  hitLines: number;
  uncoveredLines: number[];
  foundBranches: number;
  hitBranches: number;
  uncoveredBranches: string[];
  foundFunctions: number;
  hitFunctions: number;
}

function pct(hit: number, found: number): number {
  if (found === 0) {
    return 100;
  }

  return Number(((hit / found) * 100).toFixed(2));
}

function finalizeMetric(snapshotId: string, state: MutableCoverageState): CoverageFileMetric {
  return {
    id: createId(),
    coverageSnapshotId: snapshotId,
    filePath: state.filePath,
    linePct: pct(state.hitLines, state.foundLines),
    branchPct: pct(state.hitBranches, state.foundBranches),
    functionPct: pct(state.hitFunctions, state.foundFunctions),
    statementPct: pct(state.hitLines, state.foundLines),
    uncoveredLines: state.uncoveredLines,
    uncoveredBranches: state.uncoveredBranches
  };
}

export function parseLcov(lcovContent: string, snapshotId = createId()): CoverageFileMetric[] {
  const lines = lcovContent.split(/\r?\n/);
  const metrics: CoverageFileMetric[] = [];
  let state: MutableCoverageState | null = null;

  for (const line of lines) {
    if (line.startsWith("SF:")) {
      if (state) {
        metrics.push(finalizeMetric(snapshotId, state));
      }

      state = {
        filePath: line.slice(3),
        foundLines: 0,
        hitLines: 0,
        uncoveredLines: [],
        foundBranches: 0,
        hitBranches: 0,
        uncoveredBranches: [],
        foundFunctions: 0,
        hitFunctions: 0
      };
      continue;
    }

    if (!state) {
      continue;
    }

    if (line.startsWith("DA:")) {
      const [lineNumber, hits] = line.slice(3).split(",").map(Number);
      state.foundLines += 1;

      if (hits > 0) {
        state.hitLines += 1;
      } else {
        state.uncoveredLines.push(lineNumber);
      }
      continue;
    }

    if (line.startsWith("BRDA:")) {
      const [lineNumber, blockNumber, branchNumber, hits] = line.slice(5).split(",");
      state.foundBranches += 1;
      if (hits !== "-" && Number(hits) > 0) {
        state.hitBranches += 1;
      } else {
        state.uncoveredBranches.push(`${lineNumber}:${blockNumber}:${branchNumber}`);
      }
      continue;
    }

    if (line.startsWith("FNDA:")) {
      const [hits] = line.slice(5).split(",");
      state.foundFunctions += 1;
      if (Number(hits) > 0) {
        state.hitFunctions += 1;
      }
      continue;
    }

    if (line === "end_of_record" && state) {
      metrics.push(finalizeMetric(snapshotId, state));
      state = null;
    }
  }

  if (state) {
    metrics.push(finalizeMetric(snapshotId, state));
  }

  return metrics;
}

export function buildCoverageSnapshot(
  repositoryId: string,
  commitSha: string,
  fileMetrics: CoverageFileMetric[]
): CoverageSnapshotRecord {
  const snapshotId = createId();
  const normalizedMetrics = fileMetrics.map((metric) => ({
    ...metric,
    id: metric.id || createId(),
    coverageSnapshotId: snapshotId
  }));

  const average = (values: number[]) => {
    if (values.length === 0) {
      return 0;
    }

    return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
  };

  return {
    id: snapshotId,
    repositoryId,
    commitSha,
    generatedAt: nowIso(),
    linePct: average(normalizedMetrics.map((metric) => metric.linePct)),
    branchPct: average(normalizedMetrics.map((metric) => metric.branchPct)),
    functionPct: average(normalizedMetrics.map((metric) => metric.functionPct)),
    statementPct: average(normalizedMetrics.map((metric) => metric.statementPct)),
    artifactId: null,
    fileMetrics: normalizedMetrics
  };
}

export function rankTestTargets(fileMetrics: CoverageFileMetric[], limit = 5): CoverageFileMetric[] {
  return [...fileMetrics]
    .filter((metric) => !/\.(test|spec)\.[tj]sx?$/.test(metric.filePath))
    .sort((left, right) => left.linePct - right.linePct)
    .slice(0, limit);
}

async function walkFiles(rootDir: string): Promise<string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (["node_modules", ".git", "dist", "coverage"].includes(entry.name)) {
      continue;
    }

    const nextPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(nextPath)));
    } else if (/\.[cm]?[tj]sx?$/.test(entry.name)) {
      files.push(nextPath);
    }
  }

  return files;
}

export async function evaluateImpactedCoverage(
  rootDir: string,
  dependencyName: string,
  fileMetrics: CoverageFileMetric[]
): Promise<{ impactedCoverage: number | null; impactedFiles: string[]; confidence: "high" | "low" }> {
  const codeFiles = await walkFiles(rootDir);
  const impactedFiles: string[] = [];

  for (const filePath of codeFiles) {
    const content = await readFile(filePath, "utf8");
    const importsDependency =
      content.includes(`from \"${dependencyName}\"`) ||
      content.includes(`from '${dependencyName}'`) ||
      content.includes(`require(\"${dependencyName}\")`) ||
      content.includes(`require('${dependencyName}')`);

    if (importsDependency) {
      impactedFiles.push(filePath);
    }
  }

  if (impactedFiles.length === 0) {
    return {
      impactedCoverage: null,
      impactedFiles: [],
      confidence: "low"
    };
  }

  const normalizedMatches = fileMetrics.filter((metric) =>
    impactedFiles.some((filePath) => metric.filePath.endsWith(path.normalize(filePath)))
  );

  if (normalizedMatches.length === 0) {
    return {
      impactedCoverage: null,
      impactedFiles,
      confidence: "low"
    };
  }

  const impactedCoverage = Number(
    (
      normalizedMatches.reduce((sum, metric) => sum + metric.linePct, 0) / normalizedMatches.length
    ).toFixed(2)
  );

  return {
    impactedCoverage,
    impactedFiles,
    confidence: "high"
  };
}

export async function loadCoverageFromArtifacts(options: {
  repositoryId: string;
  commitSha: string;
  lcovPath?: string;
  summaryJsonPath?: string;
}): Promise<CoverageSnapshotRecord | null> {
  if (options.lcovPath) {
    const content = await readFile(options.lcovPath, "utf8");
    return buildCoverageSnapshot(options.repositoryId, options.commitSha, parseLcov(content));
  }

  if (options.summaryJsonPath) {
    const raw = JSON.parse(await readFile(options.summaryJsonPath, "utf8")) as Record<
      string,
      {
        lines?: { pct?: number };
        branches?: { pct?: number };
        functions?: { pct?: number };
        statements?: { pct?: number };
      }
    >;

    const snapshotId = createId();
    const fileMetrics = Object.entries(raw)
      .filter(([filePath]) => filePath !== "total")
      .map(([filePath, stats]) => ({
        id: createId(),
        coverageSnapshotId: snapshotId,
        filePath,
        linePct: Number(stats.lines?.pct ?? 0),
        branchPct: Number(stats.branches?.pct ?? 0),
        functionPct: Number(stats.functions?.pct ?? 0),
        statementPct: Number(stats.statements?.pct ?? 0),
        uncoveredLines: [],
        uncoveredBranches: []
      }));

    return buildCoverageSnapshot(options.repositoryId, options.commitSha, fileMetrics);
  }

  return buildCoverageSnapshot(options.repositoryId, options.commitSha, []);
}
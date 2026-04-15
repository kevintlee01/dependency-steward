import Link from "next/link";

import { Badge, Card, MetricPanel } from "@dependency-steward/ui";

import { getDashboardData } from "../lib/api";
import { AddRepoForm } from "./add-repo-form";

export default async function DashboardPage() {
  const dashboard = await getDashboardData();

  const repoNameMap = new Map(dashboard.repositories.map((r) => [r.repoId, r.fullName]));

  const runsByRepo = new Map<string, typeof dashboard.pendingRuns>();
  for (const run of dashboard.pendingRuns) {
    const name = repoNameMap.get(run.repositoryId) ?? "unknown";
    if (!runsByRepo.has(name)) runsByRepo.set(name, []);
    runsByRepo.get(name)!.push(run);
  }

  const candidatesByRepo = new Map<string, typeof dashboard.vulnerableCandidates>();
  for (const c of dashboard.vulnerableCandidates) {
    const name = c.repositoryFullName || "unknown";
    if (!candidatesByRepo.has(name)) candidatesByRepo.set(name, []);
    candidatesByRepo.get(name)!.push(c);
  }

  return (
    <div className="ds-grid">
      <section className="ds-hero">
        <Card
          className="ds-panel-dark"
          eyebrow="Operator Console"
          title="Dependency upgrades routed by evidence, not guesswork"
          subtitle="The console surfaces vulnerable dependencies, confidence gaps, and in-flight automation so reviewers can see why the system acted."
        >
          <div className="ds-actions">
            <Badge tone="info">{dashboard.repositories.length} repositories</Badge>
            <Badge tone="warn">{dashboard.manualReviewCount} manual review items</Badge>
            <Badge tone="danger">{dashboard.vulnerableCandidates.length} priority candidates</Badge>
          </div>
        </Card>
        <Card eyebrow="Run Posture" title="Current queue health" subtitle="Active work across scans, upgrades, and tests-first routing.">
          <div className="ds-grid ds-grid--metrics">
            <MetricPanel label="Connected repos" value={dashboard.repositories.length} />
            <MetricPanel label="Pending runs" value={dashboard.pendingRuns.length} />
            <MetricPanel label="Manual review" value={dashboard.manualReviewCount} />
            <MetricPanel label="High-risk candidates" value={dashboard.vulnerableCandidates.length} />
          </div>
        </Card>
      </section>

      <section className="ds-grid ds-grid--dashboard">
        <Card eyebrow="Repositories" title="Portfolio view" subtitle="Coverage, health, and open generated work per repository.">
          <div className="ds-list">
            {dashboard.repositories.map((repository) => (
              <div className="ds-list__item" key={repository.repoId}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="ds-list__title">
                    <Link href={`/repos/${repository.repoId}`}>{repository.fullName}</Link>
                  </p>
                  <p className="ds-list__meta">
                    {repository.packageManager} · {repository.testFramework} · {repository.defaultBranch}
                  </p>
                </div>
                <div className="ds-repo-badges">
                  <Badge tone={repository.healthStatus === "healthy" ? "good" : repository.healthStatus === "critical" ? "danger" : "warn"}>
                    {repository.healthStatus}
                  </Badge>
                  {repository.latestCoverage != null &&
                   repository.coverageAlertThreshold != null &&
                   repository.latestCoverage < repository.coverageAlertThreshold ? (
                    <Badge tone="danger">⚠ {repository.latestCoverage}% cov (below {repository.coverageAlertThreshold}%)</Badge>
                  ) : (
                    <Badge tone="neutral">{repository.latestCoverage ?? "n/a"}% coverage</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 24 }}>
            <AddRepoForm />
          </div>
        </Card>

        <div className="ds-grid">
          <Card eyebrow="Pending Work" title="Live run feed" subtitle="What the worker is doing now, grouped by repository.">
            <div className="ds-list">
              {[...runsByRepo.entries()].map(([repoName, runs]) => (
                <div key={repoName}>
                  <p className="ds-list__group-label">{repoName}</p>
                  {runs.map((run) => (
                    <div className="ds-list__item" key={run.runId}>
                      <div>
                        <p className="ds-list__title">{run.headline}</p>
                        <p className="ds-list__meta">{run.status.replaceAll("_", " ")}</p>
                      </div>
                      <Badge tone={run.status === "awaiting_manual_review" ? "warn" : "info"}>{run.runType}</Badge>
                    </div>
                  ))}
                </div>
              ))}
              {dashboard.pendingRuns.length === 0 && <p className="ds-muted">No pending runs.</p>}
            </div>
          </Card>

          <Card eyebrow="Priority Candidates" title="Security and risk focus" subtitle="High-risk candidates grouped by repository.">
            <div className="ds-list">
              {[...candidatesByRepo.entries()].map(([repoName, candidates]) => (
                <div key={repoName}>
                  <p className="ds-list__group-label">{repoName}</p>
                  {candidates.map((candidate) => (
                    <div className="ds-list__item" key={`${candidate.packageName}-${candidate.targetVersion}`}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p className="ds-list__title">
                          {candidate.packageName} {candidate.currentVersion} → {candidate.targetVersion}
                        </p>
                        <p className="ds-list__meta">{candidate.changelogSummary}</p>
                      </div>
                      <div className="ds-repo-badges">
                        <Badge tone={candidate.advisorySeverity === "critical" || candidate.advisorySeverity === "high" ? "danger" : "warn"}>
                          {candidate.advisorySeverity}
                        </Badge>
                        <Badge tone={candidate.recommendedAction === "tests-first" ? "warn" : "good"}>{candidate.recommendedAction}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              {dashboard.vulnerableCandidates.length === 0 && <p className="ds-muted">No priority candidates.</p>}
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
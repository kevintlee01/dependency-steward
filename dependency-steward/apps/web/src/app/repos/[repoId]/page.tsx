import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge, Card, MetricPanel, ProgressBar } from "@dependency-steward/ui";

import { getRepositoryDetail } from "../../../lib/api";

import { CandidateAction } from "./candidate-action";
import { PolicyForm } from "./policy-form";
import { RepoActions } from "./repo-actions";
import { RepoSettings } from "./repo-settings";

export default async function RepositoryPage({ params }: { params: Promise<{ repoId: string }> }) {
  const { repoId } = await params;
  const detail = await getRepositoryDetail(repoId);

  if (!detail) {
    notFound();
  }

  return (
    <div className="ds-grid">
      <nav style={{ marginBottom: 8 }}>
        <Link href="/" className="ds-back-link">← Dashboard</Link>
      </nav>
      <section className="ds-hero">
        <Card eyebrow="Repository" title={detail.repository.fullName} subtitle="Policy, candidate risk, and current automation posture.">
          <div className="ds-grid ds-grid--metrics">
            <MetricPanel label="Package manager" value={detail.repository.packageManager} />
            <MetricPanel label="Test framework" value={detail.repository.testFramework} />
            <MetricPanel label="Latest coverage" value={`${detail.latestCoverage?.linePct ?? "n/a"}%`} />
            <MetricPanel label="Generated PRs" value={detail.pullRequests.length} />
          </div>
          <div className="ds-actions" style={{ marginTop: 18 }}>
            <Badge tone={detail.repository.healthStatus === "healthy" ? "good" : detail.repository.healthStatus === "critical" ? "danger" : "warn"}>
              {detail.repository.healthStatus}
            </Badge>
            <Badge tone="neutral">Default branch {detail.repository.defaultBranch}</Badge>
          </div>
        </Card>

        <Card eyebrow="Repository Actions" title="Control plane" subtitle="Manual triggers for scan and policy changes.">
          <RepoActions repoId={detail.repository.id} />
        </Card>
      </section>

      <section className="ds-grid ds-grid--dashboard">
        <div className="ds-grid">
          <Card eyebrow="Dependency Upgrades" title="All candidates" subtitle="Every identified upgrade — install, bypass, or review. Bypassed items are hidden from the dashboard.">
            <div className="ds-list">
              {detail.candidates.filter((c) => c.status !== "completed").map((candidate) => (
                <div className="ds-candidate" key={candidate.id} style={candidate.status === "bypassed" ? { opacity: 0.5 } : undefined}>
                  <div className="ds-candidate__row">
                    <div>
                      <p className="ds-list__title">
                        {candidate.packageName} {candidate.currentVersion} → {candidate.targetVersion}
                      </p>
                      <p className="ds-list__meta">{candidate.changelogSummary}</p>
                    </div>
                    <div className="ds-candidate__badges">
                      <Badge tone={candidate.riskTier === "high" ? "danger" : candidate.riskTier === "medium" ? "warn" : "good"}>
                        {candidate.riskTier}
                      </Badge>
                      <Badge tone={candidate.status === "bypassed" ? "neutral" : candidate.recommendedAction === "tests-first" ? "warn" : candidate.recommendedAction === "manual-review" ? "danger" : "good"}>
                        {candidate.status === "bypassed" ? "bypassed" : candidate.recommendedAction}
                      </Badge>
                    </div>
                  </div>
                  <div className="ds-candidate__buttons">
                    <CandidateAction repoId={detail.repository.id} candidate={candidate} />
                  </div>
                </div>
              ))}
              {detail.candidates.length === 0 && <p className="ds-muted">No dependency candidates yet. Run a scan to discover upgrades.</p>}
            </div>
          </Card>

          <Card eyebrow="Generated PRs" title="Pull requests" subtitle="Test-backfill and dependency upgrade PRs created by the system.">
            <div className="ds-list">
              {detail.pullRequests.map((pr) => (
                <div className="ds-list__item" key={pr.id}>
                  <div>
                    <p className="ds-list__title">
                      {pr.url ? <a href={pr.url} target="_blank" rel="noopener noreferrer">{pr.title}</a> : pr.title}
                    </p>
                    <p className="ds-list__meta">{pr.branchName} · {pr.prType.replaceAll("_", " ")}</p>
                  </div>
                  <Badge tone={pr.status === "merged" ? "good" : pr.status === "open" || pr.status === "draft" ? "info" : "neutral"}>
                    {pr.status}
                  </Badge>
                </div>
              ))}
              {detail.pullRequests.length === 0 && <p className="ds-muted">No PRs generated yet.</p>}
            </div>
          </Card>

          <Card eyebrow="Recent Runs" title="Execution trace" subtitle="Latest scans, backfills, and upgrade runs.">
            <div className="ds-list">
              {detail.recentRuns.map((run) => (
                <div className="ds-list__item" key={run.runId}>
                  <div>
                    <p className="ds-list__title">
                      <Link href={`/repos/${detail.repository.id}/runs/${run.runId}`}>{run.headline}</Link>
                    </p>
                    <p className="ds-list__meta">{run.status.replaceAll("_", " ")}</p>
                  </div>
                  <Badge tone={run.status === "awaiting_manual_review" ? "warn" : run.status === "failed" ? "danger" : "info"}>
                    {run.runType}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="ds-grid">

          <Card eyebrow="Coverage" title="Current confidence" subtitle="Repository-level signal used in policy evaluation.">
            {detail.policy?.coverageAlertThreshold != null &&
             detail.latestCoverage?.linePct != null &&
             detail.latestCoverage.linePct < detail.policy.coverageAlertThreshold && (
              <div className="ds-alert ds-alert--danger" style={{ marginBottom: 16 }}>
                ⚠ Coverage ({detail.latestCoverage.linePct}%) is below the alert threshold ({detail.policy.coverageAlertThreshold}%)
              </div>
            )}
            <ProgressBar label="Line coverage" value={detail.latestCoverage?.linePct ?? 0} />
            <ProgressBar label="Branch coverage" value={detail.latestCoverage?.branchPct ?? 0} />
            <ProgressBar label="Function coverage" value={detail.latestCoverage?.functionPct ?? 0} />
          </Card>

          <Card eyebrow="Policy" title="Automation thresholds" subtitle="These settings determine whether Dependency Steward upgrades now, adds tests first, or routes to review.">
            <PolicyForm repoId={detail.repository.id} policy={detail.policy} />
          </Card>

          <Card eyebrow="Settings" title="Repository configuration" subtitle="Default branch, package manager, and test framework.">
            <RepoSettings repository={detail.repository} />
          </Card>
        </div>
      </section>
    </div>
  );
}
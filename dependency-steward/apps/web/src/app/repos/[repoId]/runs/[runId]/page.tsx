import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge, Card, RunTimeline } from "@dependency-steward/ui";

import { getRunDetail } from "../../../../../lib/api";

import { RunActions } from "./run-actions";

export default async function RunDetailPage({ params }: { params: Promise<{ repoId: string; runId: string }> }) {
  const { repoId, runId } = await params;
  const run = await getRunDetail(runId);

  if (!run) {
    notFound();
  }

  return (
    <div className="ds-grid">
      <nav style={{ marginBottom: 8 }}>
        <Link href={`/repos/${repoId}`} className="ds-back-link">← Repository</Link>
      </nav>
      <section className="ds-hero">
        <Card eyebrow="Run Detail" title={run.headline} subtitle={`Run type: ${run.runType.replaceAll("_", " ")}`}>
          <div className="ds-actions" style={{ marginBottom: 12 }}>
            <Badge tone={run.status === "succeeded" ? "good" : run.status === "failed" ? "danger" : run.status === "awaiting_manual_review" ? "warn" : "info"}>
              {run.status.replaceAll("_", " ")}
            </Badge>
            <Badge tone="neutral">{run.recommendedAction}</Badge>
            <RunActions runId={runId} repoId={repoId} />
          </div>
          {run.blockingReason ? <p className="ds-muted">{run.blockingReason}</p> : null}
          {run.dependencyCandidate ? (
            <div style={{ marginTop: 16 }}>
              <p className="ds-list__title">
                {run.dependencyCandidate.packageName} {run.dependencyCandidate.currentVersion} → {run.dependencyCandidate.targetVersion}
              </p>
              <p className="ds-list__meta">{run.dependencyCandidate.changelogSummary}</p>
            </div>
          ) : null}
        </Card>

        <Card eyebrow="Operator Notes" title="Review context" subtitle="Manual-review state and deferred upgrade metadata.">
          {run.manualReview ? (
            <div className="ds-list">
              <div className="ds-list__item">
                <div>
                  <p className="ds-list__title">Blocking reason</p>
                  <p className="ds-list__meta">{run.manualReview.message}</p>
                </div>
              </div>
              <div className="ds-list__item">
                <div>
                  <p className="ds-list__title">Next action</p>
                  <p className="ds-list__meta">{run.manualReview.nextAction}</p>
                </div>
              </div>
            </div>
          ) : (
            <p className="ds-muted">No manual-review item is attached to this run.</p>
          )}
          {run.deferredUpgrade ? (
            <div style={{ marginTop: 16 }}>
              <p className="ds-list__title">Deferred upgrade</p>
              <p className="ds-list__meta">
                {run.deferredUpgrade.packageName} → {run.deferredUpgrade.targetVersion} · {run.deferredUpgrade.status}
              </p>
            </div>
          ) : null}
        </Card>
      </section>

      <section className="ds-grid ds-grid--dashboard">
        <Card eyebrow="Timeline" title="Run steps" subtitle="Step-by-step execution state.">
          <RunTimeline steps={run.steps} />
        </Card>

        <Card eyebrow="Artifacts" title="Captured outputs" subtitle="Patch, coverage, and log artifacts persisted for review.">
          <div className="ds-list">
            {run.artifacts.map((artifact) => (
              <div className="ds-list__item" key={artifact.id}>
                <div>
                  <p className="ds-list__title">{artifact.artifactType}</p>
                  <p className="ds-list__meta">{artifact.storageKey}</p>
                </div>
                <Badge tone="neutral">{(artifact.byteSize / 1024).toFixed(1)} KB</Badge>
              </div>
            ))}
            {run.artifacts.length === 0 && <p className="ds-muted">No artifacts captured yet.</p>}
          </div>
        </Card>
      </section>
    </div>
  );
}
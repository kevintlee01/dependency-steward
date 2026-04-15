"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

import type { PolicyView } from "@dependency-steward/shared";

import { patchToApi } from "../../../lib/api";

export function PolicyForm({ repoId, policy }: { repoId: string; policy: PolicyView | null }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [values, setValues] = useState({
    coverageThreshold: policy?.minRepoCoverage ?? 80,
    requiredPassingTestRuns: policy?.requiredPassingTestRuns ?? 3,
    coverageSourcePreference: policy?.coverageSourcePreference ?? "github_actions"
  });

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);

    try {
      await patchToApi(`/api/repos/${repoId}/policy`, {
        minRepoCoverage: values.coverageThreshold,
        minImpactedCoverage: values.coverageThreshold,
        coverageAlertThreshold: values.coverageThreshold,
        requiredPassingTestRuns: values.requiredPassingTestRuns,
        securityOverrideEnabled: true,
        testBackfillEnabled: true,
        coverageSourcePreference: values.coverageSourcePreference
      });
      setMessage("Policy updated.");
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Policy update failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="ds-form" onSubmit={onSubmit}>
      <div className="ds-form__grid">
        <div className="ds-field">
          <label htmlFor="coverageThreshold" className="ds-label-row">
            Coverage threshold
            <span className="ds-help" data-tip="Minimum line coverage %. Below this, upgrades route to tests-first or manual review. Fires a dashboard alert and triggers test-backfill PRs when coverage drops.">?</span>
          </label>
          <input
            className="ds-input"
            id="coverageThreshold"
            type="number"
            min={0}
            max={100}
            value={values.coverageThreshold}
            onChange={(event) => setValues((current) => ({ ...current, coverageThreshold: Number(event.target.value) }))}
          />
        </div>
        <div className="ds-field">
          <label htmlFor="requiredPassingTestRuns" className="ds-label-row">
            Stability reruns
            <span className="ds-help" data-tip="How many consecutive passing test runs are required before an upgrade is considered stable.">?</span>
          </label>
          <input
            className="ds-input"
            id="requiredPassingTestRuns"
            type="number"
            value={values.requiredPassingTestRuns}
            onChange={(event) =>
              setValues((current) => ({ ...current, requiredPassingTestRuns: Number(event.target.value) }))
            }
          />
        </div>
        <div className="ds-field">
          <label htmlFor="coverageSourcePreference" className="ds-label-row">
            Coverage source
            <span className="ds-help" data-tip="Where coverage data comes from: GitHub Actions artifacts or worker-generated reports.">?</span>
          </label>
          <select
            className="ds-select"
            id="coverageSourcePreference"
            value={values.coverageSourcePreference}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                coverageSourcePreference: event.target.value as "github_actions" | "worker"
              }))
            }
          >
            <option value="github_actions">GitHub Actions</option>
            <option value="worker">Worker-generated</option>
          </select>
        </div>
      </div>

      <div className="ds-actions">
        <button className="ds-button ds-button--primary" disabled={pending} type="submit">
          {pending ? "Saving…" : "Save policy"}
        </button>
        {message ? <span className="ds-muted">{message}</span> : null}
      </div>
    </form>
  );
}
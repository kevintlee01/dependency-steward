"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

import type { DependencyCandidate } from "@dependency-steward/shared";

import { postToApi } from "../../../lib/api";

export function CandidateAction({ repoId, candidate }: { repoId: string; candidate: DependencyCandidate }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [queued, setQueued] = useState(false);

  async function triggerUpgrade() {
    setPending(true);
    try {
      if (candidate.recommendedAction === "tests-first") {
        await postToApi(`/api/repos/${repoId}/backfill-tests`, { candidateId: candidate.id });
      } else {
        await postToApi(`/api/repos/${repoId}/upgrade/${candidate.id}`);
      }
      setQueued(true);
      startTransition(() => router.refresh());
    } finally {
      setPending(false);
    }
  }

  async function toggleBypass() {
    setPending(true);
    try {
      await postToApi(`/api/repos/${repoId}/candidates/${candidate.id}/bypass`);
      startTransition(() => router.refresh());
    } finally {
      setPending(false);
    }
  }

  const isBypassed = candidate.status === "bypassed";
  const isRunning = candidate.status === "in_progress" || queued;

  return (
    <div className="ds-candidate__action-stack">
      {!isBypassed && (
        <button className="ds-button ds-button--ghost" disabled={pending || isRunning} onClick={triggerUpgrade} type="button">
          {pending ? "…" : isRunning ? "Running…" : candidate.recommendedAction === "tests-first" ? "Install (tests-first)" : "Install"}
        </button>
      )}
      <button
        className={`ds-button ds-button--ghost ${isBypassed ? "ds-button--bypass-active" : "ds-button--bypass"}`}
        disabled={pending}
        onClick={toggleBypass}
        type="button"
      >
        {pending ? "…" : isBypassed ? "Bypassed ✓" : "Bypass"}
      </button>
    </div>
  );
}
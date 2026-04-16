"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:4000";

export function RunActions({ runId, repoId }: { runId: string; repoId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function deleteRun() {
    setPending(true);
    try {
      const response = await fetch(`${API_BASE}/api/runs/${runId}`, { method: "DELETE" });
      if (response.ok) {
        router.push(`/repos/${repoId}`);
      }
    } finally {
      setPending(false);
      setConfirmDelete(false);
    }
  }

  return (
    <>
      <button className="ds-button ds-button--ghost ds-button--bypass" disabled={pending} onClick={() => setConfirmDelete(true)} type="button">
        Remove run
      </button>

      {confirmDelete && (
        <div className="ds-confirm-overlay" onClick={() => setConfirmDelete(false)}>
          <div className="ds-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p className="ds-list__title">Remove this run?</p>
            <p className="ds-muted" style={{ margin: "8px 0 16px" }}>
              This will permanently delete the run, all steps, artifacts, and associated evaluation records. This action cannot be undone.
            </p>
            <div className="ds-actions">
              <button className="ds-button ds-button--primary" style={{ background: "var(--danger)" }} disabled={pending} onClick={deleteRun} type="button">
                {pending ? "Deleting…" : "Yes, delete"}
              </button>
              <button className="ds-button ds-button--ghost" disabled={pending} onClick={() => setConfirmDelete(false)} type="button">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

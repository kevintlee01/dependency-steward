"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:4000";

export function RepoActions({ repoId }: { repoId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function triggerScan() {
    setPending(true);
    setMessage(null);

    try {
      const response = await fetch(`${API_BASE}/api/repos/${repoId}/scan`, { method: "POST" });
      const data = await response.json();

      if (response.status === 409) {
        setMessage(data.message ?? "A scan is already in progress.");
      } else if (!response.ok) {
        setMessage(`Scan failed with ${response.status}`);
      } else {
        setMessage("Scan queued.");
      }
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to queue scan.");
    } finally {
      setPending(false);
    }
  }

  async function deleteRepo() {
    setPending(true);
    try {
      const response = await fetch(`${API_BASE}/api/repos/${repoId}`, { method: "DELETE" });
      if (response.ok) {
        router.push("/");
      } else {
        setMessage("Failed to delete repository.");
      }
    } catch {
      setMessage("Failed to delete repository.");
    } finally {
      setPending(false);
      setConfirmDelete(false);
    }
  }

  return (
    <>
      <div className="ds-actions">
        <button className="ds-button ds-button--primary" disabled={pending} onClick={triggerScan} type="button">
          {pending ? "Queueing…" : "Run dependency scan"}
        </button>
        <button className="ds-button ds-button--ghost ds-button--bypass" disabled={pending} onClick={() => setConfirmDelete(true)} type="button">
          Remove repository
        </button>
        {message ? <span className="ds-muted">{message}</span> : null}
      </div>

      {confirmDelete && (
        <div className="ds-confirm-overlay" onClick={() => setConfirmDelete(false)}>
          <div className="ds-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p className="ds-list__title">Remove this repository?</p>
            <p className="ds-muted" style={{ margin: "8px 0 16px" }}>
              This will permanently delete the repository, all runs, candidates, coverage data, and pull request records. This action cannot be undone.
            </p>
            <div className="ds-actions">
              <button className="ds-button ds-button--primary" style={{ background: "var(--danger)" }} disabled={pending} onClick={deleteRepo} type="button">
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
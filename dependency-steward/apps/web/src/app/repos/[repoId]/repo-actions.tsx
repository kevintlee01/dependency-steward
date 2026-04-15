"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:4000";

export function RepoActions({ repoId }: { repoId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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

  return (
    <div className="ds-actions">
      <button className="ds-button ds-button--primary" disabled={pending} onClick={triggerScan} type="button">
        {pending ? "Queueing…" : "Run dependency scan"}
      </button>
      {message ? <span className="ds-muted">{message}</span> : null}
    </div>
  );
}
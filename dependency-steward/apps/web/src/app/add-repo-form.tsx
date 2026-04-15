"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

import { postToApi } from "../lib/api";

export function AddRepoForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [values, setValues] = useState({
    repoUrl: "",
    defaultBranch: "main"
  });

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!values.repoUrl.trim()) {
      setMessage("Repository URL is required.");
      return;
    }

    const urlParts = values.repoUrl.replace(/\.git$/, "").split("/");
    const name = urlParts.pop() ?? "";
    const owner = urlParts.pop() ?? "";
    const fullName = owner && name ? `${owner}/${name}` : values.repoUrl;

    setPending(true);
    setMessage(null);

    try {
      await postToApi("/api/repos", {
        fullName,
        repoUrl: values.repoUrl,
        defaultBranch: values.defaultBranch || "main"
      });
      setMessage("Repository imported — initial scan queued.");
      setValues({ repoUrl: "", defaultBranch: "main" });
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <button className="ds-button ds-button--primary" onClick={() => setOpen(true)} type="button">
        + Import repository
      </button>
    );
  }

  return (
    <form className="ds-form" onSubmit={onSubmit}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div className="ds-field" style={{ flex: "2 1 240px" }}>
          <label htmlFor="repoUrl">Repository URL</label>
          <input
            className="ds-input"
            id="repoUrl"
            type="text"
            placeholder="https://github.com/acme/api-service"
            value={values.repoUrl}
            onChange={(e) => setValues((c) => ({ ...c, repoUrl: e.target.value }))}
            autoFocus
          />
        </div>
        <div className="ds-field" style={{ flex: "1 1 120px" }}>
          <label htmlFor="defaultBranch">Branch</label>
          <input
            className="ds-input"
            id="defaultBranch"
            type="text"
            value={values.defaultBranch}
            onChange={(e) => setValues((c) => ({ ...c, defaultBranch: e.target.value }))}
          />
        </div>
        <button className="ds-button ds-button--primary" disabled={pending} type="submit" style={{ flexShrink: 0 }}>
          {pending ? "Importing…" : "Import & scan"}
        </button>
        <button className="ds-button ds-button--ghost" onClick={() => setOpen(false)} type="button" style={{ flexShrink: 0 }}>
          Cancel
        </button>
      </div>
      {message ? <span className="ds-muted" style={{ marginTop: 8, display: "block" }}>{message}</span> : null}
    </form>
  );
}

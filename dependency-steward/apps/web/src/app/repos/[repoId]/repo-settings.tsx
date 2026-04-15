"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

import type { RepositoryRecord } from "@dependency-steward/shared";

import { patchToApi } from "../../../lib/api";

export function RepoSettings({ repository }: { repository: RepositoryRecord }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [values, setValues] = useState({
    defaultBranch: repository.defaultBranch,
    packageManager: repository.packageManager,
    testFramework: repository.testFramework
  });

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);

    try {
      await patchToApi(`/api/repos/${repository.id}`, values);
      setMessage("Settings updated.");
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Settings update failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="ds-form" onSubmit={onSubmit}>
      <div className="ds-form__grid">
        <div className="ds-field">
          <label htmlFor="defaultBranch">Default branch</label>
          <input
            className="ds-input"
            id="defaultBranch"
            type="text"
            value={values.defaultBranch}
            onChange={(event) => setValues((current) => ({ ...current, defaultBranch: event.target.value }))}
          />
        </div>
        <div className="ds-field">
          <label htmlFor="packageManager">Package manager</label>
          <select
            className="ds-select"
            id="packageManager"
            value={values.packageManager}
            onChange={(event) => setValues((current) => ({ ...current, packageManager: event.target.value }))}
          >
            <option value="npm">npm</option>
            <option value="pnpm">pnpm</option>
            <option value="unknown">unknown</option>
          </select>
        </div>
        <div className="ds-field">
          <label htmlFor="testFramework">Test framework</label>
          <select
            className="ds-select"
            id="testFramework"
            value={values.testFramework}
            onChange={(event) => setValues((current) => ({ ...current, testFramework: event.target.value }))}
          >
            <option value="jest">jest</option>
            <option value="vitest">vitest</option>
            <option value="unknown">unknown</option>
          </select>
        </div>
      </div>

      <div className="ds-actions">
        <button className="ds-button ds-button--primary" disabled={pending} type="submit">
          {pending ? "Saving…" : "Save settings"}
        </button>
        {message ? <span className="ds-muted">{message}</span> : null}
      </div>
    </form>
  );
}

import {
  createMockDashboard,
  type DashboardData,
  type RepositoryDetailView,
  type RunDetail
} from "@dependency-steward/shared";

function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:4000";
}

export async function fetchJson<T>(pathname: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${pathname}`, {
    ...init,
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    throw new Error(`API request failed for ${pathname}: ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function getDashboardData(): Promise<DashboardData> {
  try {
    return await fetchJson<DashboardData>("/api/dashboard");
  } catch {
    return createMockDashboard();
  }
}

export async function getRepositoryDetail(repoId: string): Promise<RepositoryDetailView | null> {
  try {
    return await fetchJson<RepositoryDetailView>(`/api/repos/${repoId}`);
  } catch {
    return null;
  }
}

export async function getRunDetail(runId: string): Promise<RunDetail | null> {
  try {
    return await fetchJson<RunDetail>(`/api/runs/${runId}`);
  } catch {
    return null;
  }
}

export async function postToApi(pathname: string, body?: Record<string, unknown>) {
  const hasBody = body !== undefined;
  const response = await fetch(`${getApiBaseUrl()}${pathname}`, {
    method: "POST",
    headers: hasBody ? { "content-type": "application/json" } : {},
    body: hasBody ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    throw new Error(`POST ${pathname} failed with ${response.status}`);
  }

  return response.json();
}

export async function patchToApi(pathname: string, body: Record<string, unknown>) {
  const response = await fetch(`${getApiBaseUrl()}${pathname}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`PATCH ${pathname} failed with ${response.status}`);
  }

  return response.json();
}
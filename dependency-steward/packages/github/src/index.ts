import crypto from "node:crypto";

import { Octokit } from "octokit";

export interface GitHubAppCredentials {
  appId: string;
  privateKey: string;
}

export interface InstallationClientConfig extends GitHubAppCredentials {
  installationId: string;
}

function base64UrlEncode(value: Buffer | string): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function verifyWebhookSignature(payload: string, signatureHeader: string | undefined, secret: string): boolean {
  if (!signatureHeader) {
    return false;
  }

  const hash = `sha256=${crypto.createHmac("sha256", secret).update(payload).digest("hex")}`;
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signatureHeader));
}

export function createAppJwt(credentials: GitHubAppCredentials): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      iat: now - 60,
      exp: now + 600,
      iss: credentials.appId
    })
  );
  const unsignedToken = `${header}.${payload}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsignedToken), credentials.privateKey);

  return `${unsignedToken}.${base64UrlEncode(signature)}`;
}

export async function createInstallationAccessToken(config: InstallationClientConfig): Promise<string> {
  const jwt = createAppJwt(config);
  const response = await fetch(`https://api.github.com/app/installations/${config.installationId}/access_tokens`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to create installation token: ${response.status} ${await response.text()}`);
  }

  const payload = (await response.json()) as { token: string };
  return payload.token;
}

export async function createInstallationClient(config: InstallationClientConfig): Promise<Octokit> {
  const token = await createInstallationAccessToken(config);
  return new Octokit({ auth: token });
}

export async function createInstallationTokenClient(config: InstallationClientConfig): Promise<{
  client: Octokit;
  token: string;
}> {
  const token = await createInstallationAccessToken(config);
  return {
    client: new Octokit({ auth: token }),
    token
  };
}

export function createTokenClient(token: string): Octokit {
  return new Octokit({ auth: token });
}

export async function createOrUpdateBranch(input: {
  client: Octokit;
  owner: string;
  repo: string;
  branchName: string;
  baseSha: string;
}): Promise<void> {
  try {
    await input.client.rest.git.createRef({
      owner: input.owner,
      repo: input.repo,
      ref: `refs/heads/${input.branchName}`,
      sha: input.baseSha
    });
  } catch {
    await input.client.rest.git.updateRef({
      owner: input.owner,
      repo: input.repo,
      ref: `heads/${input.branchName}`,
      sha: input.baseSha,
      force: true
    });
  }
}

export async function createPullRequest(input: {
  client: Octokit;
  owner: string;
  repo: string;
  title: string;
  body: string;
  head: string;
  base: string;
  labels?: string[];
  draft?: boolean;
}): Promise<{ number: number; url: string }> {
  const pullRequest = await input.client.rest.pulls.create({
    owner: input.owner,
    repo: input.repo,
    title: input.title,
    body: input.body,
    head: input.head,
    base: input.base,
    draft: input.draft ?? false
  });

  if (input.labels?.length) {
    await input.client.rest.issues.addLabels({
      owner: input.owner,
      repo: input.repo,
      issue_number: pullRequest.data.number,
      labels: input.labels
    });
  }

  return {
    number: pullRequest.data.number,
    url: pullRequest.data.html_url
  };
}

export async function findLatestCoverageArtifact(input: {
  client: Octokit;
  owner: string;
  repo: string;
  branch: string;
  workflowName: string;
  artifactName: string;
}): Promise<{ artifactId: number; downloadUrl: string; headSha: string } | null> {
  const workflows = await input.client.rest.actions.listRepoWorkflows({
    owner: input.owner,
    repo: input.repo
  });

  const workflow = workflows.data.workflows.find((item) => item.name === input.workflowName);
  if (!workflow) {
    return null;
  }

  const runs = await input.client.rest.actions.listWorkflowRuns({
    owner: input.owner,
    repo: input.repo,
    workflow_id: workflow.id,
    branch: input.branch,
    status: "completed"
  });

  const successfulRun = runs.data.workflow_runs.find((run) => run.conclusion === "success");
  if (!successfulRun) {
    return null;
  }

  const artifacts = await input.client.rest.actions.listWorkflowRunArtifacts({
    owner: input.owner,
    repo: input.repo,
    run_id: successfulRun.id
  });

  const artifact = artifacts.data.artifacts.find((item) => item.name === input.artifactName);
  if (!artifact) {
    return null;
  }

  return {
    artifactId: artifact.id,
    downloadUrl: artifact.archive_download_url,
    headSha: successfulRun.head_sha
  };
}
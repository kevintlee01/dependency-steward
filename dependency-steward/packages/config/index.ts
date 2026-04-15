import path from "node:path";
import process from "node:process";

export interface RuntimeEnv {
  nodeEnv: string;
  port: number;
  webPort: number;
  workerPort: number;
  nextPublicApiBaseUrl: string;
  databaseUrl: string;
  redisUrl: string;
  artifactStorageRoot: string;
  githubAppId?: string;
  githubAppPrivateKey?: string;
  githubAppWebhookSecret?: string;
  githubClientId?: string;
  githubClientSecret?: string;
  githubPat?: string;
  openAiBaseUrl: string;
  openAiApiKey?: string;
  llmModel: string;
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePrivateKey(value: string | undefined): string | undefined {
  return value?.replace(/\\n/g, "\n");
}

function buildLocalDatabaseUrl(env: NodeJS.ProcessEnv): string {
  const postgresHostPort = parseNumber(env.POSTGRES_HOST_PORT, 5433);
  return `postgresql://postgres:postgres@127.0.0.1:${postgresHostPort}/dependency_steward`;
}

export function loadRuntimeEnv(env: NodeJS.ProcessEnv = process.env): RuntimeEnv {
  return {
    nodeEnv: env.NODE_ENV ?? "development",
    port: parseNumber(env.PORT, 4000),
    webPort: parseNumber(env.WEB_PORT, 3001),
    workerPort: parseNumber(env.WORKER_PORT, 4010),
    nextPublicApiBaseUrl: env.NEXT_PUBLIC_API_BASE_URL ?? `http://localhost:${parseNumber(env.PORT, 4000)}`,
    databaseUrl: env.DATABASE_URL ?? buildLocalDatabaseUrl(env),
    redisUrl: env.REDIS_URL ?? "redis://127.0.0.1:6379",
    artifactStorageRoot: path.resolve(env.ARTIFACT_STORAGE_ROOT ?? "./artifacts"),
    githubAppId: env.GITHUB_APP_ID,
    githubAppPrivateKey: normalizePrivateKey(env.GITHUB_APP_PRIVATE_KEY),
    githubAppWebhookSecret: env.GITHUB_APP_WEBHOOK_SECRET,
    githubClientId: env.GITHUB_CLIENT_ID,
    githubClientSecret: env.GITHUB_CLIENT_SECRET,
    githubPat: env.GITHUB_PAT,
    openAiBaseUrl: env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    openAiApiKey: env.OPENAI_API_KEY,
    llmModel: env.LLM_MODEL ?? "gpt-5.4"
  };
}

export function requireEnv(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${label}`);
  }

  return value;
}

export function isGitHubConfigured(env = loadRuntimeEnv()): boolean {
  return Boolean(env.githubAppId && env.githubAppPrivateKey && env.githubAppWebhookSecret);
}

export function isLlmConfigured(env = loadRuntimeEnv()): boolean {
  return Boolean(env.openAiApiKey);
}
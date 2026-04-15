import type { RuntimeEnv } from "@dependency-steward/config";
import type { QueueBundle } from "@dependency-steward/queue";

export interface ApiContext {
  env: RuntimeEnv;
  queues: QueueBundle;
  githubConfigured: boolean;
  llmConfigured: boolean;
}
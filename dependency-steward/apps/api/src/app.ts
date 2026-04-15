import Fastify from "fastify";
import cors from "@fastify/cors";

import { isGitHubConfigured, isLlmConfigured, loadRuntimeEnv } from "@dependency-steward/config";
import { createQueueBundle } from "@dependency-steward/queue";

import type { ApiContext } from "./types";
import { registerDashboardRoutes } from "./routes/dashboard";
import { registerHealthRoute } from "./routes/health";
import { registerRepositoryRoutes } from "./routes/repositories";
import { registerRunRoutes } from "./routes/runs";
import { registerWebhookRoutes } from "./routes/webhooks";

export async function buildApp() {
  const env = loadRuntimeEnv();
  const app = Fastify({ logger: true });
  const queues = createQueueBundle(env.redisUrl);

  const context: ApiContext = {
    env,
    queues,
    githubConfigured: isGitHubConfigured(env),
    llmConfigured: isLlmConfigured(env)
  };

  await app.register(cors, {
    origin: true
  });

  // Allow POST requests with no body (Fastify rejects empty JSON by default)
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_request, body, done) => {
    const text = (body as string).trim();
    if (text === "") {
      done(null, undefined);
    } else {
      try {
        done(null, JSON.parse(text));
      } catch (error) {
        done(error as Error, undefined);
      }
    }
  });

  await registerHealthRoute(app, context);
  await registerDashboardRoutes(app);
  await registerRepositoryRoutes(app, context);
  await registerRunRoutes(app, context);
  await registerWebhookRoutes(app, context);

  return { app, context };
}
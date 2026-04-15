import type { FastifyInstance } from "fastify";

import { getDashboardData } from "../services/repository-service";

export async function registerDashboardRoutes(app: FastifyInstance) {
  app.get("/api/dashboard", async () => getDashboardData());
}
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { sequelize } from "./db/client";
import { uploadRoutes } from "./modules/upload/upload.routes";
import { recordsRoutes } from "./modules/records/records.routes";
import { conflictsRoutes } from "./modules/conflicts/conflicts.routes";
import { adminRoutes } from "./modules/admin/admin.routes";
import { ssePlugin } from "./plugins/sse";

// Factory rather than a module-level singleton so tests can build fresh instances
// (via .inject()) without booting a real HTTP listener.
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });

  // The frontend (Vite dev server / nginx) runs on a different origin than the API in
  // every deployment shape this app ships with; permissive origin is fine for an
  // assessment demo (no cookies/credentialed requests are used).
  // @fastify/cors defaults `methods` to just GET,HEAD,POST (unlike the Express `cors`
  // package it's modeled after) — DELETE has to be listed explicitly or the reset-db
  // preflight is rejected by the browser before the request is ever sent.
  await app.register(cors, { origin: true, methods: ["GET", "HEAD", "POST", "DELETE"] });

  await app.register(multipart, {
    limits: {
      fileSize: 100 * 1024 * 1024, // 100MB — generous for an assessment-scale CSV
      files: 1,
    },
  });

  app.get("/health", async () => {
    await sequelize.authenticate();
    return { status: "ok" };
  });

  await app.register(uploadRoutes);
  await app.register(recordsRoutes);
  await app.register(conflictsRoutes);
  await app.register(adminRoutes);
  await app.register(ssePlugin);

  return app;
}

import type { FastifyInstance } from "fastify";
import { recordsQuerySchema } from "@scientec/shared";
import { findRecordsPage } from "./records.repository";

export async function recordsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/records", async (req, reply) => {
    const parsed = recordsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid query parameters", issues: parsed.error.issues });
    }
    return findRecordsPage(parsed.data);
  });
}

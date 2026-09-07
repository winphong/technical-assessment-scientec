import type { FastifyInstance } from "fastify";
import { resolveConflictBodySchema } from "@scientec/shared";
import { ConflictModel } from "../../db/models/conflict";
import { serializeConflict, serializeRecord } from "../../serializers";
import { eventBus } from "../../events/bus";
import { resolveConflict } from "./conflict-engine";

export async function conflictsRoutes(app: FastifyInstance): Promise<void> {
  // Pending only — resolved conflicts are visible in the records' history via
  // updated_by_upload_id / updated_at, not re-listed here. Used both for the initial
  // page load and as the reconnect fallback after an SSE gap (see useSse on the frontend).
  app.get("/conflicts", async () => {
    const conflicts = await ConflictModel.findAll({
      where: { status: "pending" },
      order: [["createdAt", "ASC"]],
    });
    return conflicts.map(serializeConflict);
  });

  app.post("/conflicts/:id/resolve", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsedBody = resolveConflictBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return reply.code(400).send({ error: "Invalid request body", issues: parsedBody.error.issues });
    }

    const outcome = await resolveConflict(id, parsedBody.data.resolution);

    if (outcome.kind === "not_found") {
      return reply.code(404).send({ error: "Conflict not found" });
    }
    if (outcome.kind === "already_resolved") {
      // The other tab won the race — this is the expected, non-error outcome of a
      // legitimate double-resolve race, not a server fault, hence 409 not 500.
      return reply.code(409).send({ error: "Conflict already resolved by another session" });
    }
    if (outcome.kind === "superseded") {
      // A newer conflicting upload for the same record replaced this one before it was
      // resolved — also a 409 (the request is no longer actionable), but a distinct
      // reason so the UI can tell the user why rather than implying a resolve race.
      return reply.code(409).send({ error: "Conflict was superseded by a newer upload" });
    }

    const conflict = serializeConflict(outcome.conflict);
    eventBus.publish({ type: "conflict:resolved", payload: conflict });
    eventBus.publish({ type: "record:updated", payload: { id: outcome.record.id } });

    return { conflict, record: serializeRecord(outcome.record) };
  });
}

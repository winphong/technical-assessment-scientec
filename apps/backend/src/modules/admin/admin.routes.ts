import type { FastifyInstance } from "fastify";
import { sequelize } from "../../db/client";

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // Testing/demo convenience only — mirrors test/helpers/testDb.ts's resetDb(). No
  // auth gate here because this app has none anywhere else (see app.ts's CORS comment).
  app.delete("/admin/reset-db", async () => {
    await sequelize.query("TRUNCATE TABLE conflicts, records, uploads RESTART IDENTITY CASCADE;");
    return { status: "ok" };
  });
}

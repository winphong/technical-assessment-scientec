import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../app";
import { sequelize } from "../../db/client";
import { RecordModel } from "../../db/models/record";
import { ConflictModel } from "../../db/models/conflict";
import { UploadModel } from "../../db/models/upload";
import { createTestUpload, resetDb } from "../../../test/helpers/testDb";
import { ingestCsvRow } from "../conflicts/conflict-engine";

let app: FastifyInstance;

beforeEach(async () => {
  await resetDb();
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await sequelize.close();
});

describe("DELETE /admin/reset-db", () => {
  it("empties uploads, records, and conflicts", async () => {
    const upload1 = await createTestUpload("a.csv");
    const upload2 = await createTestUpload("b.csv");
    await ingestCsvRow({ id: 1, postId: 1, name: "Ada", email: "ada@example.com", body: "hi" }, upload1.id);
    await ingestCsvRow({ id: 1, postId: 1, name: "Ada", email: "ada@new.com", body: "hi" }, upload2.id);

    expect(await UploadModel.count()).toBeGreaterThan(0);
    expect(await RecordModel.count()).toBeGreaterThan(0);
    expect(await ConflictModel.count()).toBeGreaterThan(0);

    const res = await app.inject({ method: "DELETE", url: "/admin/reset-db" });

    expect(res.statusCode).toBe(200);
    expect(await UploadModel.count()).toBe(0);
    expect(await RecordModel.count()).toBe(0);
    expect(await ConflictModel.count()).toBe(0);
  });
});

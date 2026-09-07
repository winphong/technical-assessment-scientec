import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../app";
import { sequelize } from "../../db/client";
import { RecordModel } from "../../db/models/record";
import { createTestUpload, resetDb } from "../../../test/helpers/testDb";
import { ingestCsvRow, resolveConflict } from "./conflict-engine";

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

async function seedConflict(id = 1) {
  const upload1 = await createTestUpload("a.csv");
  const upload2 = await createTestUpload("b.csv");
  await ingestCsvRow({ id, postId: 1, name: "Ada Lovelace", email: "ada@example.com", body: "hello" }, upload1.id);
  const outcome = await ingestCsvRow(
    { id, postId: 1, name: "Ada Lovelace", email: "ada@newdomain.com", body: "hello" },
    upload2.id,
  );
  if (outcome.kind !== "conflict") throw new Error("expected a conflict");
  return outcome.conflict;
}

describe("GET /conflicts", () => {
  it("lists only pending conflicts, excluding ones already resolved", async () => {
    const stillPending = await seedConflict(1);
    const alreadyResolved = await seedConflict(2);
    await resolveConflict(alreadyResolved.id, "keep_new");

    const res = await app.inject({ method: "GET", url: "/conflicts" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe(stillPending.id);
    expect(body[0].diffFields).toEqual(["email"]);
  });
});

describe("POST /conflicts/:id/resolve", () => {
  it("applies keep_new and broadcasts the result", async () => {
    const conflict = await seedConflict();
    const res = await app.inject({
      method: "POST",
      url: `/conflicts/${conflict.id}/resolve`,
      payload: { resolution: "keep_new" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.conflict.status).toBe("resolved_keep_new");
    expect(body.record.email).toBe("ada@newdomain.com");

    const record = await RecordModel.findByPk(1);
    expect(record?.email).toBe("ada@newdomain.com");

    // No longer listed as pending.
    const remaining = await app.inject({ method: "GET", url: "/conflicts" });
    expect(remaining.json()).toHaveLength(0);
  });

  it("applies keep_old, leaving the record as it was", async () => {
    const conflict = await seedConflict();
    const res = await app.inject({
      method: "POST",
      url: `/conflicts/${conflict.id}/resolve`,
      payload: { resolution: "keep_old" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().record.email).toBe("ada@example.com");
  });

  it("returns 409 on a second resolve attempt", async () => {
    const conflict = await seedConflict();
    await app.inject({ method: "POST", url: `/conflicts/${conflict.id}/resolve`, payload: { resolution: "keep_new" } });
    const second = await app.inject({
      method: "POST",
      url: `/conflicts/${conflict.id}/resolve`,
      payload: { resolution: "keep_old" },
    });
    expect(second.statusCode).toBe(409);
  });

  it("returns 409 with a distinct message when the conflict was superseded by a newer upload", async () => {
    const conflict = await seedConflict();
    const upload3 = await createTestUpload("c.csv");
    await ingestCsvRow(
      { id: 1, postId: 1, name: "Ada Lovelace", email: "ada@evennewer.com", body: "hello" },
      upload3.id,
    ); // supersedes `conflict`

    const res = await app.inject({
      method: "POST",
      url: `/conflicts/${conflict.id}/resolve`,
      payload: { resolution: "keep_new" },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/superseded/i);
  });

  it("returns 404 for an unknown conflict id", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/conflicts/00000000-0000-0000-0000-000000000000/resolve",
      payload: { resolution: "keep_new" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 400 for an invalid resolution value", async () => {
    const conflict = await seedConflict();
    const res = await app.inject({
      method: "POST",
      url: `/conflicts/${conflict.id}/resolve`,
      payload: { resolution: "not_a_real_choice" },
    });
    expect(res.statusCode).toBe(400);
  });
});

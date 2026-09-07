import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../app";
import { sequelize } from "../../db/client";
import { RecordModel } from "../../db/models/record";
import { createTestUpload, resetDb } from "../../../test/helpers/testDb";

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

async function seedRecords(count: number) {
  const upload = await createTestUpload();
  for (let id = 1; id <= count; id++) {
    await RecordModel.create({
      id,
      postId: 1,
      name: id === 3 ? "Gardner Findlay" : `Person ${id}`,
      email: `person${id}@example.com`,
      body: "lorem ipsum",
      updatedByUploadId: upload.id,
    });
  }
}

describe("GET /records", () => {
  it("paginates with a keyset cursor, indicating whether a next page exists", async () => {
    await seedRecords(5);

    const page1 = await app.inject({ method: "GET", url: "/records?limit=2" });
    expect(page1.statusCode).toBe(200);
    const body1 = page1.json();
    expect(body1.items.map((r: { id: number }) => r.id)).toEqual([1, 2]);
    expect(body1.nextCursor).toBe(2);

    const page2 = await app.inject({ method: "GET", url: `/records?limit=2&cursor=${body1.nextCursor}` });
    const body2 = page2.json();
    expect(body2.items.map((r: { id: number }) => r.id)).toEqual([3, 4]);
    expect(body2.nextCursor).toBe(4);

    const page3 = await app.inject({ method: "GET", url: `/records?limit=2&cursor=${body2.nextCursor}` });
    const body3 = page3.json();
    expect(body3.items.map((r: { id: number }) => r.id)).toEqual([5]);
    expect(body3.nextCursor).toBeNull(); // last page
  });

  it("stays stable under a concurrent insert, unlike OFFSET pagination would", async () => {
    await seedRecords(5);

    const page1 = await app.inject({ method: "GET", url: "/records?limit=2" });
    const cursor = page1.json().nextCursor; // 2

    // Insert a brand-new lowest-id row *between* the two page fetches. With OFFSET-based
    // pagination this would shift every subsequent page's window, duplicating or
    // skipping a row; keyset pagination is keyed on id, so it's structurally unaffected.
    const upload = await createTestUpload();
    await RecordModel.create({ id: 0, postId: 1, name: "Late Arrival", email: "late@example.com", body: "x", updatedByUploadId: upload.id });

    const page2 = await app.inject({ method: "GET", url: `/records?limit=2&cursor=${cursor}` });
    expect(page2.json().items.map((r: { id: number }) => r.id)).toEqual([3, 4]); // no duplicate of 2, no skip of 3
  });

  it("searches substrings across name/email/body via the trigram index", async () => {
    await seedRecords(5);

    const res = await app.inject({ method: "GET", url: "/records?q=gardner" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].name).toBe("Gardner Findlay");
  });

  it("rejects an invalid limit", async () => {
    const res = await app.inject({ method: "GET", url: "/records?limit=0" });
    expect(res.statusCode).toBe(400);
  });
});

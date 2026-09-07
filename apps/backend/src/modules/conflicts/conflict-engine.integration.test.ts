import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { CsvRowInput } from "@scientec/shared";
import { sequelize } from "../../db/client";
import { ConflictModel } from "../../db/models/conflict";
import { RecordModel } from "../../db/models/record";
import { computeDiffFields, ingestCsvRow, resolveConflict } from "./conflict-engine";
import { createTestUpload, resetDb } from "../../../test/helpers/testDb";

function row(overrides: Partial<CsvRowInput> = {}): CsvRowInput {
  return { id: 1, postId: 1, name: "Ada Lovelace", email: "ada@example.com", body: "hello", ...overrides };
}

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await sequelize.close();
});

describe("computeDiffFields", () => {
  it("returns only the fields that actually differ", () => {
    const a = row();
    const b = row({ email: "ada@newdomain.com" });
    expect(computeDiffFields(a, b)).toEqual(["email"]);
  });

  it("returns an empty array for identical rows", () => {
    expect(computeDiffFields(row(), row())).toEqual([]);
  });
});

describe("ingestCsvRow", () => {
  it("inserts a brand-new id with no conflict", async () => {
    const upload = await createTestUpload();
    const outcome = await ingestCsvRow(row(), upload.id);

    expect(outcome.kind).toBe("inserted");
    const record = await RecordModel.findByPk(1);
    expect(record?.name).toBe("Ada Lovelace");
    expect(await ConflictModel.count()).toBe(0);
  });

  it("is a no-op when the incoming row is identical to the committed one", async () => {
    const upload = await createTestUpload();
    await ingestCsvRow(row(), upload.id);
    const outcome = await ingestCsvRow(row(), upload.id);

    expect(outcome.kind).toBe("noop");
    expect(await ConflictModel.count()).toBe(0);
  });

  it("creates a conflict (and leaves the committed record untouched) when values differ", async () => {
    const upload1 = await createTestUpload("a.csv");
    const upload2 = await createTestUpload("b.csv");
    await ingestCsvRow(row(), upload1.id);

    const outcome = await ingestCsvRow(row({ email: "ada@newdomain.com" }), upload2.id);

    expect(outcome.kind).toBe("conflict");
    if (outcome.kind !== "conflict") throw new Error("unreachable");
    expect(outcome.conflict.diffFields).toEqual(["email"]);
    expect(outcome.conflict.oldData).toMatchObject({ email: "ada@example.com" });
    expect(outcome.conflict.newData).toMatchObject({ email: "ada@newdomain.com" });
    expect(outcome.conflict.status).toBe("pending");

    // Committed record is untouched — resolution, not ingestion, decides the outcome.
    const record = await RecordModel.findByPk(1);
    expect(record?.email).toBe("ada@example.com");
  });

  it("flags a same-file duplicate id as a conflict traceable to one upload", async () => {
    const upload = await createTestUpload();
    await ingestCsvRow(row(), upload.id);
    const outcome = await ingestCsvRow(row({ name: "Ada L." }), upload.id);

    expect(outcome.kind).toBe("conflict");
    if (outcome.kind !== "conflict") throw new Error("unreachable");
    // Both the pre-existing record and the new conflict trace back to the same upload —
    // this is the discriminator the UI/API uses to label it "duplicate within your own
    // file" rather than a true cross-upload conflict.
    expect(outcome.record.updatedByUploadId).toBe(upload.id);
    expect(outcome.conflict.uploadId).toBe(upload.id);
  });
});

describe("ingestCsvRow concurrency", () => {
  it("races two uploads introducing the same brand-new id without losing either write or double-inserting", async () => {
    for (let i = 0; i < 20; i++) {
      await resetDb();
      const id = 1000 + i;
      const uploadA = await createTestUpload("a.csv");
      const uploadB = await createTestUpload("b.csv");

      const results = await Promise.all([
        ingestCsvRow(row({ id, name: "Version A" }), uploadA.id),
        ingestCsvRow(row({ id, name: "Version B" }), uploadB.id),
      ]);

      const records = await RecordModel.findAll({ where: { id } });
      const conflicts = await ConflictModel.findAll({ where: { recordId: id } });

      expect(records).toHaveLength(1); // exactly one committed row, never zero or two
      expect(conflicts).toHaveLength(1); // the loser became a conflict, not a lost write
      const outcomes = results.map((r) => r.kind).sort();
      expect(outcomes).toEqual(["conflict", "inserted"]);
    }
  });

  it("races two differing updates against an already-committed row", async () => {
    for (let i = 0; i < 20; i++) {
      await resetDb();
      const id = 2000 + i;
      const uploadBase = await createTestUpload("base.csv");
      await ingestCsvRow(row({ id }), uploadBase.id);

      const uploadA = await createTestUpload("a.csv");
      const uploadB = await createTestUpload("b.csv");
      const results = await Promise.all([
        ingestCsvRow(row({ id, name: "Version A" }), uploadA.id),
        ingestCsvRow(row({ id, name: "Version B" }), uploadB.id),
      ]);

      const record = await RecordModel.findByPk(id);
      const conflicts = await ConflictModel.findAll({ where: { recordId: id } });

      expect(record?.name).toBe("Ada Lovelace"); // untouched — both were conflicts
      expect(conflicts).toHaveLength(2); // both differ from the committed base, both flagged
      expect(results.every((r) => r.kind === "conflict")).toBe(true);
    }
  });
});

describe("ingestCsvRow supersedes stale pending conflicts", () => {
  it("marks an earlier pending conflict outdated when a fresher conflicting upload arrives", async () => {
    const upload1 = await createTestUpload("a.csv");
    const upload2 = await createTestUpload("b.csv");
    const upload3 = await createTestUpload("c.csv");
    await ingestCsvRow(row(), upload1.id);

    const first = await ingestCsvRow(row({ email: "ada@newdomain.com" }), upload2.id);
    if (first.kind !== "conflict") throw new Error("expected a conflict");

    const second = await ingestCsvRow(row({ email: "ada@evennewer.com" }), upload3.id);
    if (second.kind !== "conflict") throw new Error("expected a conflict");

    // The second conflict reports the first as superseded, and both are now reflected
    // in the DB — exactly one pending conflict survives per record.
    expect(second.supersededConflicts.map((c) => c.id)).toEqual([first.conflict.id]);

    const reloadedFirst = await ConflictModel.findByPk(first.conflict.id);
    expect(reloadedFirst?.status).toBe("outdated");

    const reloadedSecond = await ConflictModel.findByPk(second.conflict.id);
    expect(reloadedSecond?.status).toBe("pending");
    // The surviving conflict's oldData still reflects the untouched committed record —
    // never stale, because nothing has actually been applied yet.
    expect(reloadedSecond?.oldData).toMatchObject({ email: "ada@example.com" });

    const pending = await ConflictModel.findAll({ where: { recordId: 1, status: "pending" } });
    expect(pending).toHaveLength(1);
  });

  it("also supersedes a pending conflict when the fresher upload turns out to be a noop", async () => {
    const upload1 = await createTestUpload("a.csv");
    const upload2 = await createTestUpload("b.csv");
    const upload3 = await createTestUpload("c.csv");
    await ingestCsvRow(row(), upload1.id);

    const conflict = await ingestCsvRow(row({ email: "ada@newdomain.com" }), upload2.id);
    if (conflict.kind !== "conflict") throw new Error("expected a conflict");

    // Matches the original committed row exactly — a noop, but it should still retire
    // the now-moot pending conflict from upload2.
    const noop = await ingestCsvRow(row(), upload3.id);

    expect(noop.kind).toBe("noop");
    if (noop.kind !== "noop") throw new Error("unreachable");
    expect(noop.supersededConflicts.map((c) => c.id)).toEqual([conflict.conflict.id]);

    const reloaded = await ConflictModel.findByPk(conflict.conflict.id);
    expect(reloaded?.status).toBe("outdated");
  });
});

describe("resolveConflict", () => {
  async function seedConflict() {
    const upload1 = await createTestUpload("a.csv");
    const upload2 = await createTestUpload("b.csv");
    await ingestCsvRow(row(), upload1.id);
    const outcome = await ingestCsvRow(row({ email: "ada@newdomain.com" }), upload2.id);
    if (outcome.kind !== "conflict") throw new Error("expected a conflict");
    return outcome.conflict;
  }

  it("applies the incoming data on keep_new", async () => {
    const conflict = await seedConflict();
    const outcome = await resolveConflict(conflict.id, "keep_new");

    expect(outcome.kind).toBe("resolved");
    const record = await RecordModel.findByPk(1);
    expect(record?.email).toBe("ada@newdomain.com");
  });

  it("leaves the record untouched on keep_old", async () => {
    const conflict = await seedConflict();
    const outcome = await resolveConflict(conflict.id, "keep_old");

    expect(outcome.kind).toBe("resolved");
    const record = await RecordModel.findByPk(1);
    expect(record?.email).toBe("ada@example.com");
  });

  it("rejects a second resolve attempt on the same conflict", async () => {
    const conflict = await seedConflict();
    await resolveConflict(conflict.id, "keep_new");
    const second = await resolveConflict(conflict.id, "keep_old");

    expect(second.kind).toBe("already_resolved");
    // The first resolution's outcome must stick — the second attempt must not un-apply it.
    const record = await RecordModel.findByPk(1);
    expect(record?.email).toBe("ada@newdomain.com");
  });

  it("returns superseded (not already_resolved) when trying to resolve an outdated conflict", async () => {
    const upload1 = await createTestUpload("a.csv");
    const upload2 = await createTestUpload("b.csv");
    const upload3 = await createTestUpload("c.csv");
    await ingestCsvRow(row(), upload1.id);
    const stale = await ingestCsvRow(row({ email: "ada@newdomain.com" }), upload2.id);
    if (stale.kind !== "conflict") throw new Error("expected a conflict");
    await ingestCsvRow(row({ email: "ada@evennewer.com" }), upload3.id); // supersedes `stale`

    const outcome = await resolveConflict(stale.conflict.id, "keep_new");
    expect(outcome.kind).toBe("superseded");

    // Superseding never applies the stale conflict's data — the record is untouched.
    const record = await RecordModel.findByPk(1);
    expect(record?.email).toBe("ada@example.com");
  });

  it("returns not_found for an unknown conflict id", async () => {
    const outcome = await resolveConflict("00000000-0000-0000-0000-000000000000", "keep_new");
    expect(outcome.kind).toBe("not_found");
  });

  it("races two tabs resolving the same conflict with opposite choices — exactly one wins", async () => {
    for (let i = 0; i < 20; i++) {
      await resetDb();
      const conflict = await seedConflict();

      const results = await Promise.all([
        resolveConflict(conflict.id, "keep_new"),
        resolveConflict(conflict.id, "keep_old"),
      ]);

      const kinds = results.map((r) => r.kind).sort();
      expect(kinds).toEqual(["already_resolved", "resolved"]);

      // Whichever resolution actually won, the record must match it exactly (either
      // keep_new's email or keep_old's) — never a mix, never left in a stale state.
      const record = await RecordModel.findByPk(1);
      expect(["ada@example.com", "ada@newdomain.com"]).toContain(record?.email);
    }
  });
});

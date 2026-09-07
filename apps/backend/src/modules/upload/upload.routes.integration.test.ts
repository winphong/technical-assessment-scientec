import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import FormData from "form-data";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../app";
import { sequelize } from "../../db/client";
import { RecordModel } from "../../db/models/record";
import { ConflictModel } from "../../db/models/conflict";
import { eventBus } from "../../events/bus";
import type { SseEvent } from "@scientec/shared";
import { resetDb } from "../../../test/helpers/testDb";

let app: FastifyInstance;

async function postCsv(csv: string, filename = "upload.csv") {
  const form = new FormData();
  form.append("file", Buffer.from(csv, "utf-8"), { filename, contentType: "text/csv" });
  return app.inject({
    method: "POST",
    url: "/uploads",
    payload: form,
    headers: form.getHeaders(),
  });
}

beforeEach(async () => {
  await resetDb();
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await sequelize.close();
});

describe("POST /uploads", () => {
  it("strips the BOM, ingests valid rows, and reports a clean summary", async () => {
    const csv =
      "﻿\"postId\",\"id\",\"name\",\"email\",\"body\"\n" +
      '"1","1","Ada Lovelace","ada@example.com","hello world"\n' +
      '"1","2","Alan Turing","alan@example.com","hi there"\n';

    const res = await postCsv(csv);

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rowsProcessed).toBe(2);
    expect(body.rowsRejected).toBe(0);
    expect(body.status).toBe("completed");

    const records = await RecordModel.findAll({ order: [["id", "ASC"]] });
    expect(records).toHaveLength(2);
    expect(records[0]!.name).toBe("Ada Lovelace"); // confirms the BOM didn't leak into the first column name
  });

  it("collects malformed/invalid rows without failing the whole upload", async () => {
    const csv =
      '"postId","id","name","email","body"\n' +
      '"1","1","Ada Lovelace","ada@example.com","ok row"\n' +
      '"1","not-a-number","Bad Id","also-not-an-email","bad row"\n';

    const res = await postCsv(csv);

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rowsProcessed).toBe(1);
    expect(body.rowsRejected).toBe(1);
    expect(body.rejectedSamples).toHaveLength(1);
    expect(body.rejectedSamples[0].line).toBe(3);

    expect(await RecordModel.count()).toBe(1);
  });

  it("parses a row with a genuine embedded newline inside a quoted field as one logical row", async () => {
    // The sample data.csv's "body" newlines are literal two-character `\n` text, not
    // real linebreaks, so a real RFC4180 parser must be proven against a hand-built
    // fixture like this one, not just against the sample file.
    const csv = '"postId","id","name","email","body"\n' + '"1","1","Ada Lovelace","ada@example.com","line one\nline two"\n';

    const res = await postCsv(csv);

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rowsProcessed).toBe(1);
    expect(body.rowsRejected).toBe(0);

    const record = await RecordModel.findByPk(1);
    expect(record?.body).toBe("line one\nline two");
  });

  it("rejects non-csv files", async () => {
    const form = new FormData();
    form.append("file", Buffer.from("not a csv"), { filename: "notes.txt", contentType: "text/plain" });
    const res = await app.inject({ method: "POST", url: "/uploads", payload: form, headers: form.getHeaders() });
    expect(res.statusCode).toBe(400);
  });

  it("rejects requests with no file part", async () => {
    const form = new FormData();
    form.append("note", "no file here");
    const res = await app.inject({ method: "POST", url: "/uploads", payload: form, headers: form.getHeaders() });
    expect(res.statusCode).toBe(400);
  });

  it("flags an overlapping id from a second upload as a conflict, end-to-end over HTTP", async () => {
    await postCsv('"postId","id","name","email","body"\n"1","1","Ada Lovelace","ada@example.com","v1"\n', "a.csv");
    const res = await postCsv('"postId","id","name","email","body"\n"1","1","Ada L.","ada@newdomain.com","v2"\n', "b.csv");

    expect(res.statusCode).toBe(200);
    const conflicts = await ConflictModel.findAll({ where: { recordId: 1 } });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.diffFields.sort()).toEqual(["body", "email", "name"]);

    // The committed record is untouched until someone resolves the conflict.
    const record = await RecordModel.findByPk(1);
    expect(record?.name).toBe("Ada Lovelace");
  });

  it("does not publish record:updated for a duplicate row with identical values", async () => {
    await postCsv('"postId","id","name","email","body"\n"1","1","Ada Lovelace","ada@example.com","v1"\n', "a.csv");

    const events: SseEvent[] = [];
    const onEvent = (event: SseEvent) => events.push(event);
    eventBus.on("event", onEvent);
    try {
      const res = await postCsv('"postId","id","name","email","body"\n"1","1","Ada Lovelace","ada@example.com","v1"\n', "b.csv");
      expect(res.statusCode).toBe(200);
    } finally {
      eventBus.off("event", onEvent);
    }

    expect(events.some((event) => event.type === "record:updated")).toBe(false);
    expect(await ConflictModel.count()).toBe(0);
  });

  it("ingests the real sample data.csv end-to-end with zero rejections", async () => {
    const csvPath = join(import.meta.dirname, "../../../../../data.csv");
    const csv = readFileSync(csvPath, "utf-8");

    const res = await postCsv(csv, "data.csv");

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rowsRejected).toBe(0);
    expect(body.rowsProcessed).toBe(500);
    expect(await RecordModel.count()).toBe(500);
  });
});

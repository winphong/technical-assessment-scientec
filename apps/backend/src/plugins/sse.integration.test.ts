import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TextDecoder as NodeTextDecoder } from "node:util";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app";
import { eventBus } from "../events/bus";
import { resetDb } from "../../test/helpers/testDb";

let app: FastifyInstance;
let baseUrl: string;

// SSE is a genuinely streaming response, so this needs a real listening socket read
// incrementally via fetch's ReadableStream — Fastify's `.inject()` buffers the whole
// response body and would just hang against an endpoint that never ends.
beforeEach(async () => {
  await resetDb();
  app = await buildApp();
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address();
  if (address === null || typeof address === "string") throw new Error("expected an AddressInfo");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  await app.close();
});

async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: NodeTextDecoder,
  marker: string,
  timeoutMs = 2000,
): Promise<string> {
  let acc = "";
  const deadline = Date.now() + timeoutMs;
  while (!acc.includes(marker)) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for "${marker}". Got so far: ${JSON.stringify(acc)}`);
    const { value, done } = await reader.read();
    if (done) throw new Error("SSE stream ended unexpectedly");
    acc += decoder.decode(value, { stream: true });
  }
  return acc;
}

describe("GET /events (SSE)", () => {
  it("sets Access-Control-Allow-Origin so a real cross-origin browser EventSource isn't rejected", async () => {
    // curl and a same-process fetch() (used by the other tests in this file) don't
    // enforce CORS at all — only an actual browser does, checking this header on the
    // response before handing it to EventSource. reply.hijack() (needed to keep writing
    // to this response forever) skips Fastify's normal onSend pipeline, which is where
    // @fastify/cors would otherwise have attached this header automatically.
    const response = await fetch(`${baseUrl}/events`, { headers: { Origin: "http://localhost:5173" } });
    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    await response.body!.cancel();
  });

  it("streams a live event-bus broadcast to a connected client", async () => {
    const response = await fetch(`${baseUrl}/events`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    await readUntil(reader, decoder, ":ok"); // initial handshake comment

    eventBus.publish({ type: "record:updated", payload: { id: 42 } });

    const chunk = await readUntil(reader, decoder, "record:updated");
    expect(chunk).toContain("event: record:updated");
    expect(chunk).toContain('"id":42');

    await reader.cancel();
  });

  it("broadcasts to every connected client, not just one", async () => {
    const [resA, resB] = await Promise.all([fetch(`${baseUrl}/events`), fetch(`${baseUrl}/events`)]);
    const readerA = resA.body!.getReader();
    const readerB = resB.body!.getReader();
    const decoderA = new TextDecoder();
    const decoderB = new TextDecoder();

    await Promise.all([readUntil(readerA, decoderA, ":ok"), readUntil(readerB, decoderB, ":ok")]);

    eventBus.publish({ type: "record:updated", payload: { id: 7 } });

    const [chunkA, chunkB] = await Promise.all([
      readUntil(readerA, decoderA, "record:updated"),
      readUntil(readerB, decoderB, "record:updated"),
    ]);
    expect(chunkA).toContain('"id":7');
    expect(chunkB).toContain('"id":7');

    await Promise.all([readerA.cancel(), readerB.cancel()]);
  });

  it("stops delivering events after the client disconnects (no listener leak)", async () => {
    const response = await fetch(`${baseUrl}/events`);
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    await readUntil(reader, decoder, ":ok");

    const listenersBefore = eventBus.listenerCount("event");
    await reader.cancel();
    // Cancelling the reader closes the socket; give the server's 'close' handler a tick.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(eventBus.listenerCount("event")).toBeLessThan(listenersBefore);
  });
});

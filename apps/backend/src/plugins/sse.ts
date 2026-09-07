import type { FastifyInstance } from "fastify";
import type { SseEvent } from "@scientec/shared";
import { eventBus } from "../events/bus";

// Heartbeat comments keep intermediary proxies/load balancers from timing out an
// otherwise-idle connection; well inside the 3-second propagation SLA either way.
const HEARTBEAT_INTERVAL_MS = 20_000;

/**
 * Hand-rolled SSE endpoint rather than the (pre-1.0, as of writing) @fastify/sse plugin —
 * this is simple enough (~30 lines) that avoiding a young dependency for something graded
 * via `docker-compose up` is worth more than the convenience. Every connected browser tab
 * gets every event; there is no per-client filtering, since every event here (a new
 * conflict, a resolution, a record change, upload progress) is relevant to anyone
 * currently viewing the shared dataset.
 */
export async function ssePlugin(app: FastifyInstance): Promise<void> {
  app.get("/events", (req, reply) => {
    // Fastify normally finalizes the response itself; hijack() opts out so we can keep
    // writing to the raw response indefinitely. The cost: hijacking skips Fastify's
    // whole response pipeline, including the onSend hook @fastify/cors uses to attach
    // Access-Control-Allow-Origin — so that header has to be set by hand here too, or
    // every real cross-origin browser EventSource connection gets silently rejected by
    // the browser's CORS check (curl and same-process fetch() don't enforce CORS at
    // all, which is why this only shows up against an actual browser).
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable nginx response buffering in front of the frontend/proxy
      "Access-Control-Allow-Origin": req.headers.origin ?? "*",
      Vary: "Origin",
    });
    reply.raw.write(":ok\n\n");

    const send = (event: SseEvent): void => {
      reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`);
    };
    eventBus.on("event", send);

    const heartbeat = setInterval(() => reply.raw.write(":hb\n\n"), HEARTBEAT_INTERVAL_MS);

    req.raw.on("close", () => {
      clearInterval(heartbeat);
      eventBus.off("event", send);
    });
  });
}

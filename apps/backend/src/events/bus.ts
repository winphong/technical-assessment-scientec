import { EventEmitter } from "node:events";
import type { SseEvent } from "@scientec/shared";

/**
 * In-process pub/sub that decouples "something happened" (a row was ingested, a
 * conflict was created/resolved) from "how it reaches connected browsers" (the SSE
 * transport in plugins/sse.ts, added separately). Anything that changes shared state
 * calls `eventBus.publish(...)`; the SSE plugin is the only subscriber.
 *
 * Single-process only — see IMPLEMENTATION_PLAN.md's SSE section for the documented
 * out-of-scope note on fanning this out across multiple backend replicas (would need
 * Postgres LISTEN/NOTIFY or Redis pub/sub instead of an in-memory EventEmitter).
 */
class EventBus extends EventEmitter {
  publish(event: SseEvent): void {
    this.emit("event", event);
  }
}

export const eventBus = new EventBus();
// Many concurrent SSE connections + bursts of row-level events during a large upload
// are expected; this is just raising Node's default warning threshold, not a real leak.
eventBus.setMaxListeners(100);

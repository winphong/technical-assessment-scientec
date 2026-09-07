import type { Conflict, Upload } from "./types";

// Discriminated union of every event the backend can push over SSE (GET /events).
// Keeping this as one shared type means the frontend's useSse reducer gets exhaustive
// switch checking, and adding a new event type forces both sides to be updated together.
export type SseEvent =
  | { type: "upload:progress"; payload: Upload }
  | { type: "conflict:new"; payload: Conflict }
  | { type: "conflict:resolved"; payload: Conflict }
  | { type: "conflict:outdated"; payload: Conflict }
  | { type: "record:updated"; payload: { id: number } };

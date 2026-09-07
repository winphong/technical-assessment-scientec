// Shared domain types used by both the backend (Sequelize models serialize into these
// shapes) and the frontend (React Query hooks type their cache against these).

export interface RecordRow {
  id: number;
  postId: number;
  name: string;
  email: string;
  body: string;
  updatedAt: string; // ISO timestamp
  updatedByUploadId: string | null;
}

export type UploadStatus = "pending" | "processing" | "completed" | "failed";

export interface Upload {
  id: string;
  filename: string;
  status: UploadStatus;
  bytesTotal: number | null;
  bytesProcessed: number;
  rowsProcessed: number;
  rowsRejected: number;
  rejectedSamples: RejectedRow[];
  createdAt: string;
}

export interface RejectedRow {
  line: number;
  reason: string;
  raw: Record<string, unknown>;
}

// "outdated" = superseded by a later conflicting upload against the same record before
// this one was resolved — see conflict-engine.ts's supersede-on-ingest logic. Not an
// actionable state; GET /conflicts only ever returns "pending".
export type ConflictStatus = "pending" | "resolved_keep_old" | "resolved_keep_new" | "outdated";

export interface Conflict {
  id: string;
  recordId: number;
  uploadId: string;
  oldData: CsvRowInput | null; // null when the conflict is against a not-yet-committed row (shouldn't normally happen, kept optional for safety)
  newData: CsvRowInput;
  diffFields: string[];
  status: ConflictStatus;
  resolvedAt: string | null;
  createdAt: string;
}

// The shape of one validated CSV row, prior to being persisted as a RecordRow.
export interface CsvRowInput {
  id: number;
  postId: number;
  name: string;
  email: string;
  body: string;
}

export interface PageOf<T> {
  items: T[];
  nextCursor: number | null;
}

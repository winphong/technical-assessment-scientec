// Sequelize model instances -> the plain DTO shapes declared in @scientec/shared.
// Kept as small pure functions (no I/O) so routes, upload.service.ts, and tests can
// all produce the exact same wire shape without duplicating field mapping.
import type { Conflict, CsvRowInput, RecordRow, Upload } from "@scientec/shared";
import type { ConflictModel } from "./db/models/conflict";
import type { RecordModel } from "./db/models/record";
import type { UploadModel } from "./db/models/upload";

export function serializeUpload(u: UploadModel): Upload {
  return {
    id: u.id,
    filename: u.filename,
    status: u.status,
    // BIGINT columns come back from pg/Sequelize as strings (to avoid silent precision
    // loss above Number.MAX_SAFE_INTEGER); file sizes here are nowhere near that range,
    // so coercing to number keeps the wire type matching @scientec/shared's `Upload`.
    bytesTotal: u.bytesTotal === null ? null : Number(u.bytesTotal),
    bytesProcessed: Number(u.bytesProcessed),
    // Not a DB column — only known transiently while a stream is being parsed, and
    // merged in by processUploadStream's live broadcasts (see upload.service.ts).
    rowsTotal: null,
    rowsProcessed: u.rowsProcessed,
    rowsRejected: u.rowsRejected,
    rejectedSamples: u.rejectedSamples,
    createdAt: u.createdAt.toISOString(),
  };
}

export function serializeConflict(c: ConflictModel): Conflict {
  return {
    id: c.id,
    recordId: c.recordId,
    uploadId: c.uploadId,
    oldData: (c.oldData as CsvRowInput | null) ?? null,
    newData: c.newData as CsvRowInput,
    diffFields: c.diffFields,
    status: c.status,
    resolvedAt: c.resolvedAt ? c.resolvedAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
  };
}

export function serializeRecord(r: RecordModel): RecordRow {
  return {
    id: r.id,
    postId: r.postId,
    name: r.name,
    email: r.email,
    body: r.body,
    updatedAt: r.updatedAt.toISOString(),
    updatedByUploadId: r.updatedByUploadId,
  };
}

import type { Readable } from "node:stream";
import { parse } from "csv-parse";
import pLimit from "p-limit";
import type { RejectedRow } from "@scientec/shared";
import { csvRowSchema } from "@scientec/shared";
import { UploadModel } from "../../db/models/upload";
import { ingestCsvRow } from "../conflicts/conflict-engine";
import { eventBus } from "../../events/bus";
import { serializeConflict, serializeUpload } from "../../serializers";

// Bounded concurrency across rows: high enough that 500 rows finish in well under a
// second, low enough to avoid opening hundreds of simultaneous Postgres transactions
// for a much larger file. Each row still gets its own single-advisory-lock transaction
// (see conflict-engine.ts) — this only bounds how many run at once, not their locking.
const ROW_CONCURRENCY = 8;
// Throttles how often we write upload progress to the DB and broadcast it over SSE,
// so a fast 500-row file doesn't spam either — comfortably inside the 3s SLA either way.
const PROGRESS_BROADCAST_INTERVAL_MS = 250;
// Only the first N rejected rows are kept on the upload record; large malformed files
// shouldn't balloon a JSONB column with thousands of rejection reasons.
const MAX_REJECTED_SAMPLES = 20;
// Dev-only escape hatch: set UPLOAD_ROW_DELAY_MS to artificially slow down row
// processing (e.g. to 200) so upload progress is visible in the UI for small files
// instead of finishing before anyone can see it.
const ROW_DELAY_MS = Number(process.env.UPLOAD_ROW_DELAY_MS || 0);
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Streams, validates, and ingests one uploaded CSV, row by row, without ever buffering
 * the whole file. Rows that fail validation are collected (not fatal — the rest of the
 * file still gets processed) and reported on the Upload record. Every valid row goes
 * through `ingestCsvRow`, whose outcome (inserted / no-op / conflict) is broadcast over
 * the event bus so every connected browser session sees it live.
 */
export async function processUploadStream(
  uploadId: string,
  fileStream: Readable,
  bytesTotalHint: number | null,
): Promise<void> {
  const limit = pLimit(ROW_CONCURRENCY);
  const rejectedSamples: RejectedRow[] = [];
  let bytesProcessed = 0;
  let rowsProcessed = 0;
  let rowsRejected = 0;
  let lineNumber = 1; // header is line 1; first data row is line 2
  // Known only once the parser has read every row — set right after the for-await loop
  // below, well before all of `pending` has actually finished processing.
  let rowsTotal: number | null = null;

  fileStream.on("data", (chunk: Buffer) => {
    bytesProcessed += chunk.length;
  });

  const parser = fileStream.pipe(
    parse({
      bom: true, // strips a leading UTF-8 BOM, present on the sample data.csv's header
      columns: true, // first row -> object keys (postId, id, name, email, body)
      relax_column_count: true, // a malformed row is rejected below, not a hard parse failure
      skip_empty_lines: true,
      trim: true,
    }),
  );

  let lastBroadcastAt = 0;
  const persistAndBroadcastProgress = async (force = false): Promise<void> => {
    const now = Date.now();
    if (!force && now - lastBroadcastAt < PROGRESS_BROADCAST_INTERVAL_MS)
      return;
    lastBroadcastAt = now;
    const [, [upload]] = await UploadModel.update(
      {
        bytesProcessed,
        rowsProcessed,
        rowsRejected,
        rejectedSamples: rejectedSamples.slice(0, MAX_REJECTED_SAMPLES),
      },
      { where: { id: uploadId }, returning: true },
    );
    if (upload)
      eventBus.publish({
        type: "upload:progress",
        payload: { ...serializeUpload(upload), rowsTotal },
      });
  };

  const pending: Promise<void>[] = [];

  try {
    for await (const raw of parser) {
      lineNumber += 1;
      const currentLine = lineNumber;
      const parsedRow = csvRowSchema.safeParse(raw);

      if (!parsedRow.success) {
        rowsRejected += 1;
        rejectedSamples.push({
          line: currentLine,
          reason: parsedRow.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; "),
          raw,
        });
        continue;
      }

      const data = parsedRow.data;
      pending.push(
        limit(async () => {
          const outcome = await ingestCsvRow(data, uploadId);
          if (ROW_DELAY_MS > 0) await sleep(ROW_DELAY_MS);
          rowsProcessed += 1;

          if (outcome.kind === "conflict") {
            eventBus.publish({
              type: "conflict:new",
              payload: serializeConflict(outcome.conflict),
            });
          } else if (outcome.kind === "inserted") {
            eventBus.publish({
              type: "record:updated",
              payload: { id: data.id },
            });
          }
          // "noop": the row was a duplicate with identical values — no record was
          // actually changed, so no record:updated event.

          if (outcome.kind === "conflict" || outcome.kind === "noop") {
            for (const superseded of outcome.supersededConflicts) {
              eventBus.publish({
                type: "conflict:outdated",
                payload: serializeConflict(superseded),
              });
            }
          }

          await persistAndBroadcastProgress();
        }),
      );
    }

    rowsTotal = lineNumber - 1;
    await persistAndBroadcastProgress(true);

    await Promise.all(pending);

    await UploadModel.update(
      {
        status: "completed",
        bytesTotal: bytesTotalHint ?? bytesProcessed,
        bytesProcessed,
        rowsProcessed,
        rowsRejected,
        rejectedSamples: rejectedSamples.slice(0, MAX_REJECTED_SAMPLES),
      },
      { where: { id: uploadId } },
    );
  } catch (err) {
    // Wait out whatever rows were already in flight before marking the upload failed,
    // so we don't race our own "failed" write against still-completing ingestions.
    await Promise.allSettled(pending);
    await UploadModel.update(
      {
        status: "failed",
        bytesProcessed,
        rowsProcessed,
        rowsRejected,
        rejectedSamples: rejectedSamples.slice(0, MAX_REJECTED_SAMPLES),
      },
      { where: { id: uploadId } },
    );
    throw err;
  } finally {
    await persistAndBroadcastProgress(true);
  }
}

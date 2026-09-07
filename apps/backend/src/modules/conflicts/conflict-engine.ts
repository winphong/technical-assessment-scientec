import { QueryTypes, Transaction } from "sequelize";
import type { CsvRowInput } from "@scientec/shared";
import { sequelize } from "../../db/client";
import { RecordModel } from "../../db/models/record";
import { ConflictModel } from "../../db/models/conflict";

/**
 * Runs `fn` inside a transaction that holds a Postgres advisory lock keyed on `recordId`
 * for the transaction's lifetime. This is the ONLY way any code path in this app is
 * allowed to read-then-write a `records` row for a given id — CSV ingestion
 * (`ingestCsvRow`) and conflict resolution (`resolveConflict`) both go through here,
 * which is what makes the two race-free with respect to each other, and what makes
 * "new id vs new id" races collapse into the same handling as "new vs existing".
 *
 * `pg_advisory_xact_lock` locks on the *value* of `recordId`, not an existing row, so it
 * works identically whether a row for that id is already committed or not — unlike
 * `SELECT ... FOR UPDATE`, which is a no-op when the row doesn't exist yet and would let
 * two concurrent inserts for a brand-new id race unguarded. The lock is released
 * automatically at COMMIT/ROLLBACK (the "_xact_" variant). Isolation is left at
 * Postgres's default READ COMMITTED — this is pessimistic mutual exclusion via the lock,
 * not optimistic conflict detection, so there's nothing for a stricter isolation level to
 * buy us here.
 *
 * Each transaction takes at most one advisory lock (never more than one recordId per
 * call), which is what rules out lock-ordering deadlocks between two callers.
 */
export async function withRecordLock<T>(recordId: number, fn: (t: Transaction) => Promise<T>): Promise<T> {
  return sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED }, async (t) => {
    await sequelize.query("SELECT pg_advisory_xact_lock(:id)", {
      replacements: { id: recordId },
      transaction: t,
      type: QueryTypes.SELECT,
    });
    return fn(t);
  });
}

const COMPARABLE_FIELDS = ["postId", "name", "email", "body"] as const;

/** Field-level diff, computed once here so neither the API nor the frontend re-derives it. */
export function computeDiffFields(current: CsvRowInput, incoming: CsvRowInput): string[] {
  return COMPARABLE_FIELDS.filter((field) => current[field] !== incoming[field]);
}

function toCsvRowInput(record: RecordModel): CsvRowInput {
  return { id: record.id, postId: record.postId, name: record.name, email: record.email, body: record.body };
}

export type IngestOutcome =
  | { kind: "inserted"; record: RecordModel }
  | { kind: "noop"; record: RecordModel; supersededConflicts: ConflictModel[] }
  | { kind: "conflict"; record: RecordModel; conflict: ConflictModel; supersededConflicts: ConflictModel[] };

/**
 * Marks any still-pending conflict(s) against `recordId` as "outdated" — called whenever
 * a fresher row for that id is ingested, whether it turns out to be a new conflict or a
 * noop. A fresher upload always wins the one "actionable" slot for a record rather than
 * stacking alongside older pending conflicts: with at most one live conflict per record,
 * its `oldData` can never go stale relative to a resolution that landed on a since-
 * superseded sibling, and the human reviewer is never asked to adjudicate a proposal an
 * even-newer upload has already overtaken. Must run inside the caller's `withRecordLock`
 * transaction — that's what makes "mark stale siblings outdated" and "create the new
 * conflict" atomic with respect to a concurrent ingest or resolve on the same record.
 */
async function supersedePendingConflicts(recordId: number, t: Transaction): Promise<ConflictModel[]> {
  const [, superseded] = await ConflictModel.update(
    { status: "outdated" },
    { where: { recordId, status: "pending" }, transaction: t, returning: true },
  );
  return superseded;
}

/**
 * Ingests one already-validated CSV row:
 *  - id not yet committed  -> insert, no conflict.
 *  - id committed, identical values -> no-op (a duplicate, not a real conflict) — but
 *    still supersedes any pending conflict left over from an earlier, now-stale upload.
 *  - id committed, values differ -> the committed record is left untouched and a
 *    `Conflict` row is created instead, capturing old/new snapshots + which fields
 *    differ, after superseding any pending conflict already open against this record.
 *    The caller (upload.service.ts) is responsible for broadcasting the resulting SSE
 *    events (both the new conflict and any superseded ones).
 *
 * Because every call goes through `withRecordLock`, this same function correctly
 * handles the "two uploads introduce the same brand-new id concurrently" race too: the
 * loser simply sees the winner's just-committed row on its (lock-guarded) re-read and
 * produces a normal conflict against it. Same for two occurrences of the same id within
 * a single file — the second occurrence conflicts against the first's just-committed row.
 */
export async function ingestCsvRow(row: CsvRowInput, uploadId: string): Promise<IngestOutcome> {
  return withRecordLock(row.id, async (t) => {
    const existing = await RecordModel.findByPk(row.id, { transaction: t });

    if (!existing) {
      const record = await RecordModel.create(
        {
          id: row.id,
          postId: row.postId,
          name: row.name,
          email: row.email,
          body: row.body,
          updatedByUploadId: uploadId,
        },
        { transaction: t },
      );
      return { kind: "inserted", record };
    }

    const diffFields = computeDiffFields(toCsvRowInput(existing), row);
    if (diffFields.length === 0) {
      const supersededConflicts = await supersedePendingConflicts(row.id, t);
      return { kind: "noop", record: existing, supersededConflicts };
    }

    const supersededConflicts = await supersedePendingConflicts(row.id, t);
    const conflict = await ConflictModel.create(
      { recordId: row.id, uploadId, oldData: toCsvRowInput(existing), newData: row, diffFields },
      { transaction: t },
    );
    return { kind: "conflict", record: existing, conflict, supersededConflicts };
  });
}

export type ResolveOutcome =
  | { kind: "resolved"; conflict: ConflictModel; record: RecordModel }
  | { kind: "already_resolved" }
  | { kind: "superseded" }
  | { kind: "not_found" };

/**
 * Resolves a pending conflict. Also goes through `withRecordLock` (keyed on the
 * conflict's `recordId`) — without that, a fresh upload racing in on the same id between
 * this function reading "pending" and writing the record could silently clobber the
 * resolution a moment later. Double-resolve (two tabs resolving the same conflict) is
 * guarded independently by the atomic `WHERE status = 'pending'` conditional update:
 * the loser gets `already_resolved` back, never a partial/duplicate apply.
 */
export async function resolveConflict(
  conflictId: string,
  resolution: "keep_old" | "keep_new",
): Promise<ResolveOutcome> {
  // Read-only lookup, outside any lock, purely to learn which recordId to lock on.
  const existing = await ConflictModel.findByPk(conflictId);
  if (!existing) {
    return { kind: "not_found" };
  }

  return withRecordLock(existing.recordId, async (t) => {
    const [count, rows] = await ConflictModel.update(
      {
        status: resolution === "keep_new" ? "resolved_keep_new" : "resolved_keep_old",
        resolvedAt: new Date(),
      },
      { where: { id: conflictId, status: "pending" }, transaction: t, returning: true },
    );

    if (count === 0) {
      // The conditional update didn't apply — either someone else resolved it between
      // our lookup above and acquiring the lock, or a newer conflicting upload for the
      // same record superseded it in the interim. Distinguish the two so the caller can
      // give the user an accurate reason instead of a generic "already resolved".
      const current = await ConflictModel.findByPk(conflictId, { transaction: t });
      return current?.status === "outdated" ? { kind: "superseded" } : { kind: "already_resolved" };
    }

    const conflict = rows[0]!;

    if (resolution === "keep_new") {
      const newData = conflict.newData;
      await RecordModel.update(
        {
          postId: newData.postId,
          name: newData.name,
          email: newData.email,
          body: newData.body,
          updatedByUploadId: conflict.uploadId,
        },
        { where: { id: conflict.recordId }, transaction: t },
      );
    }
    // keep_old: no-op — the committed record already holds the old values, since
    // ingestCsvRow never applied the conflicting write in the first place.

    const record = await RecordModel.findByPk(conflict.recordId, { transaction: t, rejectOnEmpty: true });
    return { kind: "resolved", conflict, record };
  });
}

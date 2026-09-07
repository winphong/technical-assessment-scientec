import { QueryTypes } from "sequelize";
import type { PageOf, RecordRow } from "@scientec/shared";
import { sequelize } from "../../db/client";

interface FindRecordsPageParams {
  cursor?: number;
  q?: string;
  limit: number;
}

interface RecordRowDb {
  id: number;
  post_id: number;
  name: string;
  email: string;
  body: string;
  updated_at: string;
  updated_by_upload_id: string | null;
}

function toRecordRow(row: RecordRowDb): RecordRow {
  return {
    id: row.id,
    postId: row.post_id,
    name: row.name,
    email: row.email,
    body: row.body,
    updatedAt: new Date(row.updated_at).toISOString(),
    updatedByUploadId: row.updated_by_upload_id,
  };
}

/**
 * Keyset pagination (`WHERE id > :cursor ORDER BY id LIMIT n`) rather than `OFFSET`: it
 * uses the primary key index directly and stays stable if rows are inserted mid-scroll,
 * unlike `OFFSET n` whose page boundaries shift under concurrent writes — relevant here
 * since uploads can be landing new rows while someone else is paging through the list.
 *
 * Search is substring/partial match over `search_blob` (a generated `name || email ||
 * body` column, see the init migration) via the `pg_trgm` GIN index, so e.g. "gard"
 * matches "gardner.biz" — a `tsvector` full-text index would only match whole lexemes.
 */
export async function findRecordsPage({ cursor, q, limit }: FindRecordsPageParams): Promise<PageOf<RecordRow>> {
  const conditions: string[] = [];
  const replacements: Record<string, unknown> = { limit: limit + 1 };

  if (cursor !== undefined) {
    conditions.push("id > :cursor");
    replacements.cursor = cursor;
  }
  if (q) {
    conditions.push("search_blob ILIKE :q");
    replacements.q = `%${q}%`;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await sequelize.query<RecordRowDb>(
    `SELECT id, post_id, name, email, body, updated_at, updated_by_upload_id
     FROM records
     ${where}
     ORDER BY id ASC
     LIMIT :limit`,
    { replacements, type: QueryTypes.SELECT },
  );

  // Fetching one extra row is the standard trick to know whether a next page exists
  // without a separate COUNT(*) query.
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const items = page.map(toRecordRow);
  const nextCursor = hasMore ? items[items.length - 1]!.id : null;

  return { items, nextCursor };
}

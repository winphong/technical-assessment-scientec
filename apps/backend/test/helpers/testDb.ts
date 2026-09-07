import { sequelize } from "../../src/db/client";
import { UploadModel } from "../../src/db/models/upload";

// NODE_ENV=test (set automatically by vitest) routes src/db/client.ts at the
// `scientec_test` database, so this never touches dev data. TRUNCATE ... CASCADE resets
// all three tables regardless of their FK ON DELETE actions (CASCADE always cascades to
// referencing tables); RESTART IDENTITY is a no-op today since every PK here is a UUID,
// not a sequence, but costs nothing to keep in case a future table adds one.
export async function resetDb(): Promise<void> {
  await sequelize.query(
    "TRUNCATE TABLE conflicts, records, uploads RESTART IDENTITY CASCADE;",
  );
}

/** Every conflict/record write needs a real uploads row to satisfy the FK constraint. */
export async function createTestUpload(
  filename = "test.csv",
): Promise<UploadModel> {
  return UploadModel.create({ filename });
}

// Loaded once before the test run (see vitest.config.ts) so PGHOST/PGPORT/etc. from
// .env are present before src/db/client.ts computes its connection config at import time.
import "dotenv/config";

import "reflect-metadata";
import { Sequelize } from "sequelize-typescript";
import { RecordModel } from "./models/record";
import { UploadModel } from "./models/upload";
import { ConflictModel } from "./models/conflict";
import { ConflictStatusModel } from "./models/conflict-status";

// App-runtime Sequelize instance. Mirrors src/db/config/config.cjs (the sequelize-cli
// config) but lives in TS since the running app is ESM/TS via bun, unlike the CLI which
// runs plain CommonJS with no build step.
//
// Vitest sets NODE_ENV=test automatically, and since models bind to this singleton at
// import time, that's enough to route the whole test run at a separate `_test` database
// (migrated via `sequelize-cli ... --env test`, see package.json) without touching dev data.
const isTest = process.env.NODE_ENV === "test";
const database = isTest
  ? process.env.PGDATABASE_TEST || `${process.env.PGDATABASE || "scientec"}_test`
  : process.env.PGDATABASE || "scientec";

export const sequelize = new Sequelize({
  dialect: "postgres",
  host: process.env.PGHOST || "localhost",
  port: Number(process.env.PGPORT || 5432),
  username: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "postgres",
  database,
  logging: false,
  // sequelize-typescript models are plain decorated classes with no reference to any
  // Sequelize instance of their own — registering them here (instead of each model
  // calling Model.init(..., { sequelize }) itself) is what the decorator-based API
  // buys us, and it's also what avoids a circular import between client.ts and the
  // model files.
  models: [RecordModel, UploadModel, ConflictModel, ConflictStatusModel],
});

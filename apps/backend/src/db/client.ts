import "reflect-metadata";
import { Sequelize } from "sequelize-typescript";
import { RecordModel } from "./models/record";
import { UploadModel } from "./models/upload";
import { ConflictModel } from "./models/conflict";
import { ConflictStatusModel } from "./models/conflict-status";

const isTest = process.env.NODE_ENV === "test";

const database = isTest
  ? process.env.PGDATABASE_TEST ||
    `${process.env.PGDATABASE || "scientec"}_test`
  : process.env.PGDATABASE || "scientec";

export const sequelize = new Sequelize({
  dialect: "postgres",
  host: process.env.PGHOST || "localhost",
  port: Number(process.env.PGPORT || 5432),
  username: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "postgres",
  database,
  logging: false,
  pool: {
    max: 20,
  },
  models: [RecordModel, UploadModel, ConflictModel, ConflictStatusModel],
});

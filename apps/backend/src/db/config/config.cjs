// sequelize-cli config (plain CommonJS, read directly by node — no TS build step needed
// just to run migrations). Same env vars are read by src/db/client.ts at app runtime.
require("dotenv/config");

const common = {
  dialect: "postgres",
  host: process.env.PGHOST || "localhost",
  port: Number(process.env.PGPORT || 5432),
  username: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "postgres",
  database: process.env.PGDATABASE || "scientec",
  logging: false,
};

module.exports = {
  development: common,
  test: { ...common, database: process.env.PGDATABASE_TEST || `${common.database}_test` },
  production: common,
};

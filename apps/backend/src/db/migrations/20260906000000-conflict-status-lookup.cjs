"use strict";

// Replaces the Postgres ENUM on conflicts.status with a lookup table + FK. The ENUM
// required a schema migration (ALTER TYPE ... ADD VALUE, which can't even run inside the
// same transaction as other DDL on older Postgres) every time a new status was added —
// e.g. introducing "outdated" for the supersede-on-ingest behavior. A lookup table turns
// that into a plain INSERT, with referential integrity still enforced at the DB level via
// the FK (an ORM-level `DataType.STRING` column can't typo its way past it).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("conflict_statuses", {
      code: { type: Sequelize.TEXT, primaryKey: true, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
    });

    await queryInterface.bulkInsert("conflict_statuses", [
      { code: "pending" },
      { code: "resolved_keep_old" },
      { code: "resolved_keep_new" },
      // Superseded by a later conflicting upload against the same record before this one
      // was resolved — see conflict-engine.ts.
      { code: "outdated" },
    ]);

    // ENUM -> TEXT + FK. Order matters: drop the default (an enum-typed literal) before
    // the type change, then re-add a plain-text default afterward.
    await queryInterface.sequelize.query('ALTER TABLE conflicts ALTER COLUMN status DROP DEFAULT;');
    await queryInterface.sequelize.query(
      'ALTER TABLE conflicts ALTER COLUMN status TYPE TEXT USING status::text;',
    );
    await queryInterface.sequelize.query(
      "ALTER TABLE conflicts ALTER COLUMN status SET DEFAULT 'pending';",
    );
    await queryInterface.addConstraint("conflicts", {
      fields: ["status"],
      type: "foreign key",
      name: "fk_conflicts_status",
      references: { table: "conflict_statuses", field: "code" },
    });
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_conflicts_status";');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint("conflicts", "fk_conflicts_status");
    // Any "outdated" rows have no ENUM value to revert to — down migrations here are a
    // best-effort dev convenience anyway, so they're remapped to "pending" rather than
    // failing the rollback outright.
    await queryInterface.sequelize.query(
      "UPDATE conflicts SET status = 'pending' WHERE status = 'outdated';",
    );
    await queryInterface.sequelize.query(
      `CREATE TYPE "enum_conflicts_status" AS ENUM ('pending', 'resolved_keep_old', 'resolved_keep_new');`,
    );
    await queryInterface.sequelize.query('ALTER TABLE conflicts ALTER COLUMN status DROP DEFAULT;');
    await queryInterface.sequelize.query(
      `ALTER TABLE conflicts ALTER COLUMN status TYPE "enum_conflicts_status" USING status::"enum_conflicts_status";`,
    );
    await queryInterface.sequelize.query(
      "ALTER TABLE conflicts ALTER COLUMN status SET DEFAULT 'pending';",
    );
    await queryInterface.dropTable("conflict_statuses");
  },
};

"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS pg_trgm;');

    await queryInterface.createTable("records", {
      id: { type: Sequelize.INTEGER, primaryKey: true, allowNull: false },
      post_id: { type: Sequelize.INTEGER, allowNull: false },
      name: { type: Sequelize.STRING, allowNull: false },
      email: { type: Sequelize.STRING, allowNull: false },
      body: { type: Sequelize.TEXT, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      // FK to uploads added after the uploads table exists, see below.
      updated_by_upload_id: { type: Sequelize.UUID, allowNull: true },
    });

    // Generated column + trigram index for fast "type any substring, match name/email/body"
    // search. Not expressible via Sequelize's table-builder DSL, hence raw SQL.
    await queryInterface.sequelize.query(`
      ALTER TABLE records
      ADD COLUMN search_blob text GENERATED ALWAYS AS (name || ' ' || email || ' ' || body) STORED;
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX idx_records_search_trgm ON records USING gin (search_blob gin_trgm_ops);
    `);

    await queryInterface.createTable("uploads", {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      filename: { type: Sequelize.STRING, allowNull: false },
      status: {
        type: Sequelize.ENUM("pending", "processing", "completed", "failed"),
        allowNull: false,
        defaultValue: "pending",
      },
      bytes_total: { type: Sequelize.BIGINT, allowNull: true },
      bytes_processed: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
      rows_processed: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      rows_rejected: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      rejected_samples: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
    });

    await queryInterface.addConstraint("records", {
      fields: ["updated_by_upload_id"],
      type: "foreign key",
      name: "fk_records_updated_by_upload_id",
      references: { table: "uploads", field: "id" },
      onDelete: "SET NULL",
    });

    await queryInterface.createTable("conflicts", {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      record_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "records", key: "id" },
        onDelete: "CASCADE",
      },
      upload_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "uploads", key: "id" },
        onDelete: "CASCADE",
      },
      old_data: { type: Sequelize.JSONB, allowNull: true },
      new_data: { type: Sequelize.JSONB, allowNull: false },
      diff_fields: { type: Sequelize.ARRAY(Sequelize.TEXT), allowNull: false },
      status: {
        type: Sequelize.ENUM("pending", "resolved_keep_old", "resolved_keep_new"),
        allowNull: false,
        defaultValue: "pending",
      },
      resolved_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
    });

    // Conflict list is read via GET /conflicts filtered to pending, and joined by record.
    await queryInterface.addIndex("conflicts", ["status"], { name: "idx_conflicts_status" });
    await queryInterface.addIndex("conflicts", ["record_id"], { name: "idx_conflicts_record_id" });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("conflicts");
    await queryInterface.removeConstraint("records", "fk_records_updated_by_upload_id");
    await queryInterface.dropTable("uploads");
    await queryInterface.dropTable("records");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_conflicts_status";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_uploads_status";');
  },
};

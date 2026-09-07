"use strict";

// Enforces "at most one upload in flight at a time" at the DB level, closing the
// SELECT-then-INSERT race a plain application-level check would leave open. The WHERE
// clause already restricts the index to rows where status = 'processing', so indexing on
// status alone is enough for uniqueness — all indexed rows share that one value.
module.exports = {
  async up(queryInterface) {
    await queryInterface.addIndex("uploads", ["status"], {
      name: "uploads_single_processing_idx",
      unique: true,
      where: { status: "processing" },
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("uploads", "uploads_single_processing_idx");
  },
};

import "reflect-metadata";
import { Table, Column, Model, PrimaryKey, AllowNull, DataType } from "sequelize-typescript";
import type { CreationOptional, InferAttributes, InferCreationAttributes } from "sequelize";

// Lookup table backing conflicts.status (see migrations/*-conflict-status-lookup.cjs).
// Adding a new status is a row insert here, not a schema migration — the app never
// queries this table directly, it exists purely so the FK on conflicts.status can
// enforce referential integrity without a Postgres ENUM type.
@Table({ tableName: "conflict_statuses", timestamps: true, createdAt: "createdAt", updatedAt: false })
export class ConflictStatusModel extends Model<
  InferAttributes<ConflictStatusModel>,
  InferCreationAttributes<ConflictStatusModel>
> {
  @PrimaryKey
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare code: CreationOptional<string>;

  @Column({ type: DataType.DATE, field: "created_at" })
  declare createdAt: CreationOptional<Date>;
}

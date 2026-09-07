import "reflect-metadata";
import { Table, Column, Model, PrimaryKey, Default, AllowNull, DataType, ForeignKey } from "sequelize-typescript";
import type { CreationOptional, InferAttributes, InferCreationAttributes } from "sequelize";
import type { ConflictStatus, CsvRowInput } from "@scientec/shared";
import { ConflictStatusModel } from "./conflict-status";

@Table({ tableName: "conflicts", timestamps: true, createdAt: "createdAt", updatedAt: false })
export class ConflictModel extends Model<InferAttributes<ConflictModel>, InferCreationAttributes<ConflictModel>> {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: CreationOptional<string>;

  @AllowNull(false)
  @Column({ type: DataType.INTEGER, field: "record_id" })
  declare recordId: number;

  @AllowNull(false)
  @Column({ type: DataType.UUID, field: "upload_id" })
  declare uploadId: string;

  @Column({ type: DataType.JSONB, field: "old_data", allowNull: true })
  declare oldData: CsvRowInput | null;

  @AllowNull(false)
  @Column({ type: DataType.JSONB, field: "new_data" })
  declare newData: CsvRowInput;

  @AllowNull(false)
  @Column({ type: DataType.ARRAY(DataType.TEXT), field: "diff_fields" })
  declare diffFields: string[];

  // FK to conflict_statuses.code (see migrations/*-conflict-status-lookup.cjs) rather
  // than a Postgres ENUM — new statuses are a row insert there, not a schema migration.
  @ForeignKey(() => ConflictStatusModel)
  @Default("pending")
  @Column(DataType.TEXT)
  declare status: CreationOptional<ConflictStatus>;

  @Column({ type: DataType.DATE, field: "resolved_at", allowNull: true })
  declare resolvedAt: Date | null;

  @Column({ type: DataType.DATE, field: "created_at" })
  declare createdAt: CreationOptional<Date>;
}

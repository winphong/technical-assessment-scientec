import "reflect-metadata";
import {
  Table,
  Column,
  Model,
  PrimaryKey,
  AllowNull,
  DataType,
} from "sequelize-typescript";
import type {
  CreationOptional,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";

// Mirrors the `records` table (see migrations/*-create-records.cjs). The generated
// `search_blob` trigram-indexed column lives at the DB level only (created via raw SQL
// in the migration) and is queried with raw SQL in records.repository.ts rather than
// declared as a model attribute — it is never written to via the ORM.
@Table({
  tableName: "records",
  timestamps: true,
  createdAt: "createdAt",
  updatedAt: "updatedAt",
})
export class RecordModel extends Model<
  InferAttributes<RecordModel>,
  InferCreationAttributes<RecordModel>
> {
  @PrimaryKey
  @Column(DataType.INTEGER)
  declare id: number;

  @AllowNull(false)
  @Column({ type: DataType.INTEGER, field: "post_id" })
  declare postId: number;

  @AllowNull(false)
  @Column(DataType.STRING)
  declare name: string;

  @AllowNull(false)
  @Column(DataType.STRING)
  declare email: string;

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare body: string;

  @Column({ type: DataType.DATE, field: "created_at" })
  declare createdAt: CreationOptional<Date>;

  @Column({ type: DataType.DATE, field: "updated_at" })
  declare updatedAt: CreationOptional<Date>;

  @Column({
    type: DataType.UUID,
    field: "updated_by_upload_id",
    allowNull: true,
  })
  declare updatedByUploadId: string | null;
}

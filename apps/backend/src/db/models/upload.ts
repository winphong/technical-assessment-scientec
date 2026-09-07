import "reflect-metadata";
import { Table, Column, Model, PrimaryKey, Default, AllowNull, DataType } from "sequelize-typescript";
import type { CreationOptional, InferAttributes, InferCreationAttributes } from "sequelize";
import type { RejectedRow, UploadStatus } from "@scientec/shared";

@Table({ tableName: "uploads", timestamps: true, createdAt: "createdAt", updatedAt: false })
export class UploadModel extends Model<InferAttributes<UploadModel>, InferCreationAttributes<UploadModel>> {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: CreationOptional<string>;

  @AllowNull(false)
  @Column(DataType.STRING)
  declare filename: string;

  @Default("pending")
  @Column(DataType.ENUM("pending", "processing", "completed", "failed"))
  declare status: CreationOptional<UploadStatus>;

  @Column({ type: DataType.BIGINT, field: "bytes_total", allowNull: true })
  declare bytesTotal: number | null;

  @Default(0)
  @Column({ type: DataType.BIGINT, field: "bytes_processed" })
  declare bytesProcessed: CreationOptional<number>;

  @Default(0)
  @Column({ type: DataType.INTEGER, field: "rows_processed" })
  declare rowsProcessed: CreationOptional<number>;

  @Default(0)
  @Column({ type: DataType.INTEGER, field: "rows_rejected" })
  declare rowsRejected: CreationOptional<number>;

  // Capped sample of rejected-row details (first N), not every rejection, to keep the row small.
  @Default([])
  @Column({ type: DataType.JSONB, field: "rejected_samples" })
  declare rejectedSamples: CreationOptional<RejectedRow[]>;

  @Column({ type: DataType.DATE, field: "created_at" })
  declare createdAt: CreationOptional<Date>;
}

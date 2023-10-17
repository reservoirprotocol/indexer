import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("data_export_tasks_pkey", ["id"], { unique: true })
@Entity("data_export_tasks", { schema: "public" })
export class DataExportTasks {
  @PrimaryGeneratedColumn({ type: "integer", name: "id" })
  id: number;

  @Column("text", { name: "source" })
  source: string;

  @Column("jsonb", { name: "cursor", nullable: true })
  cursor: object | null;

  @Column("integer", { name: "sequence_number", default: () => "1" })
  sequenceNumber: number;

  @Column("timestamp with time zone", {
    name: "created_at",
    default: () => "now()",
  })
  createdAt: Date;

  @Column("timestamp with time zone", {
    name: "updated_at",
    default: () => "now()",
  })
  updatedAt: Date;

  @Column("text", { name: "name" })
  name: string;

  @Column("text", { name: "target_table_name" })
  targetTableName: string;

  @Column("boolean", { name: "is_active", default: () => "false" })
  isActive: boolean;
}

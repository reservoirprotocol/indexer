import { Column, Entity } from "typeorm";

@Entity("awsdms_apply_exceptions", { schema: "public" })
export class AwsdmsApplyExceptions {
  @Column("character varying", { name: "TASK_NAME", length: 128 })
  taskName: string;

  @Column("character varying", { name: "TABLE_OWNER", length: 128 })
  tableOwner: string;

  @Column("character varying", { name: "TABLE_NAME", length: 128 })
  tableName: string;

  @Column("timestamp without time zone", { name: "ERROR_TIME" })
  errorTime: Date;

  @Column("text", { name: "STATEMENT" })
  statement: string;

  @Column("text", { name: "ERROR" })
  error: string;
}

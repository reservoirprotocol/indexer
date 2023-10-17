import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("awsdms_ddl_audit_pkey", ["cKey"], { unique: true })
@Entity("awsdms_ddl_audit", { schema: "public" })
export class AwsdmsDdlAudit {
  @PrimaryGeneratedColumn({ type: "bigint", name: "c_key" })
  cKey: string;

  @Column("timestamp without time zone", { name: "c_time", nullable: true })
  cTime: Date | null;

  @Column("character varying", { name: "c_user", nullable: true, length: 64 })
  cUser: string | null;

  @Column("character varying", { name: "c_txn", nullable: true, length: 16 })
  cTxn: string | null;

  @Column("character varying", { name: "c_tag", nullable: true, length: 24 })
  cTag: string | null;

  @Column("integer", { name: "c_oid", nullable: true })
  cOid: number | null;

  @Column("character varying", { name: "c_name", nullable: true, length: 64 })
  cName: string | null;

  @Column("character varying", { name: "c_schema", nullable: true, length: 64 })
  cSchema: string | null;

  @Column("text", { name: "c_ddlqry", nullable: true })
  cDdlqry: string | null;
}

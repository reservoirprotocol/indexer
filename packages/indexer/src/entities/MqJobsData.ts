import { Column, Entity, Index } from "typeorm";

@Index("mq_jobs_data_pkey", ["id"], { unique: true })
@Entity("mq_jobs_data", { schema: "public" })
export class MqJobsData {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "uuid_generate_v4()",
  })
  id: string;

  @Column("text", { name: "queue_name", nullable: true })
  queueName: string | null;

  @Column("jsonb", { name: "data" })
  data: object;
}

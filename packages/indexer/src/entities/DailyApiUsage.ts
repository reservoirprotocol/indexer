import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index(
  "daily_api_usage_day_api_key_route_status_code_unique_index",
  ["apiKey", "day", "route", "statusCode"],
  { unique: true }
)
@Index("daily_api_usage_pk", ["id"], { unique: true })
@Entity("daily_api_usage")
export class DailyApiUsage {
  @Column("text", { name: "api_key" })
  apiKey: string;

  @Column("text", { name: "route" })
  route: string;

  @Column("integer", { name: "api_calls_count", default: () => "0" })
  apiCallsCount: number;

  @Column("integer", { name: "status_code" })
  statusCode: number;

  @Column("integer", { name: "points", default: () => "0" })
  points: number;

  @Column("timestamp with time zone", { name: "day" })
  day: Date;

  @PrimaryGeneratedColumn({ type: "bigint", name: "id" })
  id: string;
}

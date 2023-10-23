import { Column, Entity, Index } from "typeorm";

@Index("daily_volumes_pk", ["collectionId", "timestamp"], { unique: true })
@Entity("daily_volumes")
export class DailyVolumes {
  @Column("text", { primary: true, name: "collection_id" })
  collectionId: string;

  @Column("integer", { primary: true, name: "timestamp" })
  timestamp: number;

  @Column("numeric", { name: "volume", precision: 78, scale: 0 })
  volume: string;

  @Column("integer", { name: "rank" })
  rank: number;

  @Column("numeric", {
    name: "floor_sell_value",
    nullable: true,
    precision: 78,
    scale: 0,
  })
  floorSellValue: string | null;

  @Column("integer", { name: "sales_count", nullable: true })
  salesCount: number | null;

  @Column("numeric", {
    name: "volume_clean",
    nullable: true,
    precision: 78,
    scale: 0,
  })
  volumeClean: string | null;

  @Column("integer", { name: "rank_clean", nullable: true })
  rankClean: number | null;

  @Column("numeric", {
    name: "floor_sell_value_clean",
    nullable: true,
    precision: 78,
    scale: 0,
  })
  floorSellValueClean: string | null;

  @Column("integer", { name: "sales_count_clean", nullable: true })
  salesCountClean: number | null;

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
}

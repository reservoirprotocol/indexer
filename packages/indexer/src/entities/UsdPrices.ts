import { Column, Entity, Index } from "typeorm";

@Index("usd_prices_pk", ["currency", "timestamp"], { unique: true })
@Entity("usd_prices")
export class UsdPrices {
  @Column("bytea", { primary: true, name: "currency" })
  currency: Buffer;

  @Column("timestamp with time zone", { primary: true, name: "timestamp" })
  timestamp: Date;

  @Column("numeric", { name: "value" })
  value: string;
}

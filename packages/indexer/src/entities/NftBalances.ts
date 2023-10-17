import { Column, Entity, Index } from "typeorm";

@Index("nft_balances_owner_acquired_at_index", ["acquiredAt", "owner"], {})
@Index("nft_balances_contract_owner_index", ["amount", "contract", "owner"], {})
@Index("nft_balances_pk", ["amount", "contract", "owner", "tokenId"], {
  unique: true,
})
@Index("nft_balances_owner_contract_token_id_index", ["contract", "owner", "tokenId"], {})
@Index(
  "nft_balances_owner_last_token_appraisal_value_index",
  ["lastTokenAppraisalValue", "owner"],
  {}
)
@Entity("nft_balances", { schema: "public" })
export class NftBalances {
  @Column("bytea", { primary: true, name: "contract" })
  contract: Buffer;

  @Column("numeric", {
    primary: true,
    name: "token_id",
    precision: 78,
    scale: 0,
  })
  tokenId: string;

  @Column("bytea", { primary: true, name: "owner" })
  owner: Buffer;

  @Column("numeric", { primary: true, name: "amount", precision: 78, scale: 0 })
  amount: string;

  @Column("timestamp with time zone", { name: "acquired_at", nullable: true })
  acquiredAt: Date | null;

  @Column("text", { name: "floor_sell_id", nullable: true })
  floorSellId: string | null;

  @Column("numeric", {
    name: "floor_sell_value",
    nullable: true,
    precision: 78,
    scale: 0,
  })
  floorSellValue: string | null;

  @Column("text", { name: "top_buy_id", nullable: true })
  topBuyId: string | null;

  @Column("numeric", {
    name: "top_buy_value",
    nullable: true,
    precision: 78,
    scale: 0,
  })
  topBuyValue: string | null;

  @Column("bytea", { name: "top_buy_maker", nullable: true })
  topBuyMaker: Buffer | null;

  @Column("numeric", {
    name: "last_token_appraisal_value",
    nullable: true,
    precision: 78,
    scale: 0,
  })
  lastTokenAppraisalValue: string | null;
}

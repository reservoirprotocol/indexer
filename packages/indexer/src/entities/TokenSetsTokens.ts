import { Column, Entity, Index } from "typeorm";

@Index("token_sets_tokens_pk", ["contract", "tokenId", "tokenSetId"], {
  unique: true,
})
@Index("token_sets_tokens_contract_token_id_index", ["contract", "tokenId", "tokenSetId"], {})
@Entity("token_sets_tokens")
export class TokenSetsTokens {
  @Column("text", { primary: true, name: "token_set_id" })
  tokenSetId: string;

  @Column("bytea", { primary: true, name: "contract" })
  contract: Buffer;

  @Column("numeric", {
    primary: true,
    name: "token_id",
    precision: 78,
    scale: 0,
  })
  tokenId: string;
}

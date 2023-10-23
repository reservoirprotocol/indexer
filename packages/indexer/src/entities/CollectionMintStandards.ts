import { Column, Entity, Index } from "typeorm";

@Index("collection_mint_standards_pk", ["collectionId"], { unique: true })
@Entity("collection_mint_standards")
export class CollectionMintStandards {
  @Column("text", { primary: true, name: "collection_id" })
  collectionId: string;

  @Column("enum", {
    name: "standard",
    enum: [
      "unknown",
      "seadrop-v1.0",
      "zora",
      "manifold",
      "thirdweb",
      "decent",
      "foundation",
      "lanyard",
      "mintdotfun",
      "soundxyz",
      "createdotfun",
    ],
  })
  standard:
    | "unknown"
    | "seadrop-v1.0"
    | "zora"
    | "manifold"
    | "thirdweb"
    | "decent"
    | "foundation"
    | "lanyard"
    | "mintdotfun"
    | "soundxyz"
    | "createdotfun";
}

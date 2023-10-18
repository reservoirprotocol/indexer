import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("collections_sets_collections_hash_unique_index", ["collectionsHash"], {
  unique: true,
})
@Index("collections_sets_pk", ["id"], { unique: true })
@Entity("collections_sets")
export class CollectionsSets {
  @PrimaryGeneratedColumn({ type: "bigint", name: "id" })
  id: string;

  @Column("text", { name: "collections_hash", nullable: true })
  collectionsHash: string | null;
}

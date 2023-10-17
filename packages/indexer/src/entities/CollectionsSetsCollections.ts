import { Column, Entity, Index } from "typeorm";

@Index("collections_sets_collections_pk", ["collectionId", "collectionsSetId"], { unique: true })
@Entity("collections_sets_collections", { schema: "public" })
export class CollectionsSetsCollections {
  @Column("text", { primary: true, name: "collections_set_id" })
  collectionsSetId: string;

  @Column("text", { primary: true, name: "collection_id" })
  collectionId: string;
}

import { Column, Entity, Index } from "typeorm";

@Index("wyvern_proxies_pk", ["owner"], { unique: true })
@Entity("wyvern_proxies", { schema: "public" })
export class WyvernProxies {
  @Column("bytea", { primary: true, name: "owner" })
  owner: Buffer;

  @Column("bytea", { name: "proxy" })
  proxy: Buffer;
}

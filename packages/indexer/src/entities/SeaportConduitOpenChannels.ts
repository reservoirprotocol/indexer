import { Column, Entity, Index } from "typeorm";

@Index("seaport_conduit_open_channels_pk", ["channel", "conduitKey"], {
  unique: true,
})
@Entity("seaport_conduit_open_channels", { schema: "public" })
export class SeaportConduitOpenChannels {
  @Column("bytea", { primary: true, name: "conduit_key" })
  conduitKey: Buffer;

  @Column("bytea", { primary: true, name: "channel" })
  channel: Buffer;
}

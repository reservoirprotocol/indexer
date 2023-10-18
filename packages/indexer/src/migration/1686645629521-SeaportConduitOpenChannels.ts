import { MigrationInterface, QueryRunner } from "typeorm";
export class SeaportConduitOpenChannels1686645629521 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

CREATE TABLE "seaport_conduit_open_channels" (
  "conduit_key" BYTEA NOT NULL,
  "channel" BYTEA NOT NULL
);

ALTER TABLE "seaport_conduit_open_channels"
  ADD CONSTRAINT "seaport_conduit_open_channels_pk"
  PRIMARY KEY ("conduit_key", "channel");

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "seaport_conduit_open_channels";`);
  }
}

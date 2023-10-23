import { MigrationInterface, QueryRunner } from "typeorm";
export class FlaggedAddresses1664467735775 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

CREATE TABLE "flagged_addresses" (
  "address" BYTEA NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "flagged_addresses"
  ADD CONSTRAINT "flagged_addresses_pk"
  PRIMARY KEY ("address");

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "flagged_addresses";`);
  }
}

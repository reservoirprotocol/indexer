import { MigrationInterface, QueryRunner } from "typeorm";
export class Alter1689087567231 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE tokens REPLICA IDENTITY FULL;
ALTER TABLE orders REPLICA IDENTITY FULL;
ALTER TABLE fill_events_2 REPLICA IDENTITY FULL;
ALTER TABLE collections REPLICA IDENTITY FULL;
ALTER TABLE nft_transfer_events REPLICA IDENTITY FULL;

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE tokens REPLICA IDENTITY DEFAULT;
ALTER TABLE orders REPLICA IDENTITY DEFAULT;
ALTER TABLE fill_events_2 REPLICA IDENTITY DEFAULT;
ALTER TABLE collections REPLICA IDENTITY DEFAULT;`
    );
  }
}

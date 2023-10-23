import { MigrationInterface, QueryRunner } from "typeorm";
export class CollectionsOwnersCount1684443851969 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "collections" ADD COLUMN "owner_count" INT;

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "collections" DROP COLUMN "owner_count";`);
  }
}

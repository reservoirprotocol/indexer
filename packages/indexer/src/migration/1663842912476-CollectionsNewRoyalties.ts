import { MigrationInterface, QueryRunner } from "typeorm";
export class CollectionsNewRoyalties1663842912476 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "collections" ADD COLUMN "new_royalties" JSONB;

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "collections" DROP COLUMN "new_royalties" JSONB;`);
  }
}

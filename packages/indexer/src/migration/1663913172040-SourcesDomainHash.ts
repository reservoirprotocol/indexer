import { MigrationInterface, QueryRunner } from "typeorm";
export class SourcesDomainHash1663913172040 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "sources_v2" ADD COLUMN "domain_hash" TEXT NOT NULL;

CREATE UNIQUE INDEX "sources_domain_hash_unique_index"
  ON "sources_v2" ("domain_hash");

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sources_v2" DROP COLUMN "domain_hash";`);
  }
}

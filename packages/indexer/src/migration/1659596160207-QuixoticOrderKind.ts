import { MigrationInterface, QueryRunner } from "typeorm";
export class QuixoticOrderKind1659596160207 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "order_kind_t" ADD VALUE 'quixotic';
ALTER TYPE "order_kind_t" ADD VALUE 'nouns';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}

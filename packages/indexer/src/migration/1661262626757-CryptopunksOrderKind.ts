import { MigrationInterface, QueryRunner } from "typeorm";
export class CryptopunksOrderKind1661262626757 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "order_kind_t" ADD VALUE 'cryptopunks';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}

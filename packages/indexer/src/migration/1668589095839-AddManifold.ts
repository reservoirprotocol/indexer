import { MigrationInterface, QueryRunner } from "typeorm";
export class AddManifold1668589095839 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
ALTER TYPE "order_kind_t" ADD VALUE 'manifold';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}

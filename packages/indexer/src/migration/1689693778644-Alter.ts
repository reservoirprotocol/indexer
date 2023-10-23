import { MigrationInterface, QueryRunner } from "typeorm";
export class Alter1689693778644 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE token_attributes REPLICA IDENTITY FULL;

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE token_attributes REPLICA IDENTITY DEFAULT;`);
  }
}

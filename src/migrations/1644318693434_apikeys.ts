/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("apikeys", {
    key: {
      type: "character(36)",
      notNull: true,
      primaryKey: true,
    },
    name: {
      type: "character(255)",
      notNull: true,
    },
    website: {
      type: "character(2048)",
      notNull: true,
    },
    email: {
      type: "character(254)",
      notNull: true,
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: 'NOW()'
    },
    active: {
      type: "boolean",
      notNull: true,
      default: true
    }
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("apikeys");
}

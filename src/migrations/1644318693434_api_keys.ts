/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("api_keys", {
    key: {
      type: "text",
      notNull: true,
      primaryKey: true,
    },
    app_name: {
      type: "text",
      notNull: true,
    },
    website: {
      type: "text",
      notNull: true,
    },
    email: {
      type: "text",
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
  pgm.dropTable("api_keys");
}

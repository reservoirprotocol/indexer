import migrationRunner from "node-pg-migrate";
import { acquireLock, redis, releaseLock } from "@/common/redis";
import { logger } from "@/common/logger";
import { delay } from "@/common/utils";

import { config } from "@/config/index";

export const runDBMigration = async () => {
  const EXPIRATION_LOCK = 300;
  const CHECK_MIGRATION_INTERVAL = 1000;
  const dbMigrationLock = "db-migration-lock";
  const dbMigrationVersion = "db-migration-version";

  const doRun = async () => {
    if (await acquireLock(dbMigrationLock, EXPIRATION_LOCK)) {
      logger.info("postgresql-migration", `Start postgresql migration`);
      try {
        await migrationRunner({
          dryRun: false,
          databaseUrl: {
            connectionString: config.databaseUrl,
          },
          dir: "./src/migrations",
          ignorePattern: "\\..*",
          schema: "public",
          createSchema: undefined,
          migrationsSchema: undefined,
          createMigrationsSchema: undefined,
          migrationsTable: "pgmigrations",
          count: undefined,
          timestamp: false,
          file: undefined,
          checkOrder: false,
          verbose: true,
          direction: "up",
          singleTransaction: true,
          noLock: false,
          fake: false,
          decamelize: undefined,
        });

        await redis.set(dbMigrationVersion, config.imageTag);

        logger.info("postgresql-migration", `Stop postgresql migration`);
      } catch (err) {
        logger.error("postgresql-migration", `${err}`);
      } finally {
        await releaseLock(dbMigrationLock);
      }
    } else {
      logger.debug(
        "postgresql-migration",
        `postgresql migration in progress in a different instance`
      );
      await delay(CHECK_MIGRATION_INTERVAL);
    }
  };

  while ((await redis.get(dbMigrationVersion)) !== config.imageTag) {
    await doRun();
  }
  logger.info("postgresql-migration", `postgresql database schema is up to date`);
};

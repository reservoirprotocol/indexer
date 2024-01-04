import PgPromise from "pg-promise";

import { config } from "@/config/index";

export const pgp = PgPromise();

// Database connection for external public-facing APIs
export const edb = pgp({
  connectionString: config.databaseUrl,
  keepAlive: true,
  max: 50,
  connectionTimeoutMillis: 10 * 1000,
  query_timeout: 10 * 1000,
  statement_timeout: config.disableDatabaseStatementTimeout ? undefined : 10 * 1000,
  allowExitOnIdle: true,
});

// Database connection for internal processes/APIs
export const idb = pgp({
  connectionString: config.databaseUrl,
  keepAlive: true,
  max: 70,
  connectionTimeoutMillis: 30 * 1000,
  query_timeout: 5 * 60 * 1000,
  statement_timeout: config.disableDatabaseStatementTimeout ? undefined : 5 * 60 * 1000,
  allowExitOnIdle: true,
});

// Database connection for health checks
export const hdb = pgp({
  connectionString: config.databaseUrl,
  keepAlive: true,
  max: 5,
  connectionTimeoutMillis: 30 * 1000,
  query_timeout: 30 * 1000,
  statement_timeout: config.disableDatabaseStatementTimeout ? undefined : 30 * 1000,
  allowExitOnIdle: true,
});

// Database connection for external public-facing APIs using a read replica DB
export const redb = pgp({
  connectionString: config.readReplicaDatabaseUrl,
  keepAlive: true,
  max: 60,
  connectionTimeoutMillis: 10 * 1000,
  query_timeout: 10 * 1000,
  statement_timeout: config.disableDatabaseStatementTimeout ? undefined : 10 * 1000,
  allowExitOnIdle: true,
});

export const redbAlt = pgp({
  connectionString: config.readReplicaDatabaseUrl,
  keepAlive: true,
  max: 60,
  connectionTimeoutMillis: 20 * 1000,
  query_timeout: 20 * 1000,
  statement_timeout: config.disableDatabaseStatementTimeout ? undefined : 20 * 1000,
  allowExitOnIdle: true,
});

// Database connection for internal processes/APIs using a read replica DB
export const ridb = pgp({
  connectionString: config.readReplicaDatabaseUrl,
  keepAlive: true,
  max: config.chainId === 1 ? 100 : 60,
  connectionTimeoutMillis: 30 * 1000,
  query_timeout: 5 * 60 * 1000,
  statement_timeout: config.disableDatabaseStatementTimeout ? undefined : 5 * 60 * 1000,
  allowExitOnIdle: true,
});

// Common types

export type PgPromiseQuery = {
  query: string;
  values?: object;
};

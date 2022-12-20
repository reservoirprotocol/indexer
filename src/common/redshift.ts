import PgPromise from "pg-promise";

import { config } from "@/config/index";

export const rsp = PgPromise();

export const redshift = config.redshiftUrl
  ? rsp({
      connectionString: config.redshiftUrl,
      keepAlive: true,
      max: 60,
      connectionTimeoutMillis: 30 * 1000,
      query_timeout: 5 * 60 * 1000,
      statement_timeout: 5 * 60 * 1000,
      allowExitOnIdle: true,
    })
  : null;

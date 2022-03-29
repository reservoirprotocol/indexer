import { createLogger, format, transports } from "winston";

import { network } from "@/common/provider";
import { config } from "@/config/index";

const log = (level: "error" | "info" | "warn") => {
  const service = `indexer-${config.version}-${network}`;

  const logger = createLogger({
    exitOnError: false,
    format: format.combine(
      format.timestamp({
        format: "YYYY-MM-DD HH:mm:ss",
      }),
      format.json()
    ),
    transports: [
      process.env.DATADOG_API_KEY
        ? new transports.Http({
            host: "http-intake.logs.datadoghq.com",
            path: `/api/v2/logs?dd-api-key=${process.env.DATADOG_API_KEY}&ddsource=nodejs&service=${service}`,
            ssl: true,
          })
        : // Fallback to logging to standard output
          new transports.Console(),
    ],
  });

  return (component: string, message: string) =>
    logger.log(level, message, { component, version: process.env.npm_package_version });
};

export const logger = {
  error: log("error"),
  info: log("info"),
  warn: log("warn"),
};

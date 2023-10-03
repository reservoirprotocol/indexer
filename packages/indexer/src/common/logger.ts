import { createLogger, format, Logger, transports } from "winston";
import { getServiceName } from "@/config/network";

import { networkInterfaces } from "os";

import * as Transport from "winston-transport";

/* eslint-disable @typescript-eslint/no-explicit-any */
const nets: any = networkInterfaces();
/* eslint-disable @typescript-eslint/no-explicit-any */
const results: any = {};

for (const name of Object.keys(nets)) {
  for (const net of nets[name]) {
    // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
    if (net.family === "IPv4" && !net.internal) {
      if (!results[name]) {
        results[name] = [];
      }
      results[name].push(net.address);
    }
  }
}

let _logger: Logger;

const log = (level: "error" | "info" | "warn" | "debug") => {
  const getLogger = () => {
    const service = getServiceName();
    const _transports: Transport[] = [];

    if (process.env.DATADOG_API_KEY) {
      _transports.push(
        new transports.Http({
          host: "http-intake.logs.datadoghq.com",
          path: `/api/v2/logs?dd-api-key=${process.env.DATADOG_API_KEY}&ddsource=nodejs&service=${service}`,
          ssl: true,
        })
      );
    } else {
      _transports.push(new transports.Console());
    }

    return createLogger({
      exitOnError: false,
      level: "debug",
      defaultMeta: {
        service,
      },
      format: format.combine(
        format.timestamp({
          format: "YYYY-MM-DD HH:mm:ss",
        }),
        format.json()
      ),
      transports: _transports,
    });
  };

  _logger = _logger || getLogger();
  // _logger = getLogger();

  return (component: string, message: string) =>
    _logger.log(level, message, {
      component,
      version: process.env.npm_package_version,
      networkInterfaces: results,
    });
};

export const logger = {
  error: log("error"),
  info: log("info"),
  warn: log("warn"),
  debug: log("debug"),
};

/**
 * Don't use this, wip
 * allows us to create metrics when we need them, but we need a statsd server
 */
import { StatsD } from 'hot-shots';

import { config } from "@/config/index";

let client: StatsD|undefined = undefined;

export class Metrics {
  public static init() {
    if (process.env.STATSD_HOST) {
      client = new StatsD({
        host: process.env.STATSD_HOST,
        port: 8020,
        globalTags: {version: config.version},
        errorHandler: function (error) {
          console.log("Socket errors caught here: ", error);
        }
      });
    }
  }

  public static client(): StatsD|undefined {
    if (client !== undefined) {
      return client
    }
  }
}

Metrics.init();

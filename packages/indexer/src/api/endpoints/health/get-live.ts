import * as Boom from "@hapi/boom";
import { RouteOptions } from "@hapi/hapi";

import { HealthCheck } from "@/common/healthcheck";
import { log } from "index";

export const getLiveOptions: RouteOptions = {
  description: "The live health check, checks if all necessary services are reachable.",
  handler: async () => {
    log("GET /health/live");
    if (await HealthCheck.check()) {
      log("Service healthy");
      return true;
    } else {
      log("Service not healthy");
      throw Boom.internal("Service not healthy");
    }
  },
};

import * as Boom from "@hapi/boom";
import { RouteOptions } from "@hapi/hapi";

import { HealthCheck } from "@/common/healthcheck";

export const getLiveOptions: RouteOptions = {
  description: "The live health check, checks if all necessary services are reachable.",
  handler: async () => {
    if (await HealthCheck.check()) {
      return true;
    } else {
      throw Boom.internal("Service not healthy");
    }
  },
};

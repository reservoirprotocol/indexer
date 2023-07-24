/* eslint-disable no-console */

import * as Boom from "@hapi/boom";
import { RouteOptions } from "@hapi/hapi";

import { HealthCheck } from "@/common/healthcheck";

export const getLiveOptions: RouteOptions = {
  description: "The live health check, checks if all necessary services are reachable.",
  handler: async () => {
    console.log("getLive - start");

    if (await HealthCheck.check()) {
      console.log("getLive - ok");
      return true;
    } else {
      console.log("getLive - not healthy");
      throw Boom.internal("Service not healthy");
    }
  },
};

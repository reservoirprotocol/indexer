/* eslint-disable no-console */

import * as Boom from "@hapi/boom";
import { RouteOptions } from "@hapi/hapi";

import { HealthCheck } from "@/common/healthcheck";

export const getLiveOptions: RouteOptions = {
  description: "The live health check, checks if all necessary services are reachable.",
  handler: async () => {
    const start = new Date().getTime();

    console.log("getLive - start");

    if (await HealthCheck.check()) {
      console.log("getLive - ok", new Date().getTime() - start);
      return true;
    } else {
      console.log("getLive - not healthy", new Date().getTime() - start);
      throw Boom.internal("Service not healthy");
    }
  },
};

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { HealthCheck } from "@/common/healthcheck"

export const getLiveOptions: RouteOptions = {
  description:
    "The live health check, checks if all necessary services are reachable",
  response: {
    failAction: (_request, _h, error) => {
      logger.error("get_live_handler", `Health check failed`);

      throw error;
    },
  },
  handler: async (request: Request) => {
    if (await HealthCheck.check()) {
      return true;
    } else {
      throw new Error();
    }
  },
}

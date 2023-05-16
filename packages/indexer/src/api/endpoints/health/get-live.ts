import * as Boom from "@hapi/boom";
import { RouteOptions } from "@hapi/hapi";

import { HealthCheck } from "@/common/healthcheck";
import { TokenRecalcSupplyJob } from "@/jobs/token-updates/token-recalc-supply-job";

export const getLiveOptions: RouteOptions = {
  description: "The live health check, checks if all necessary services are reachable.",
  handler: async () => {
    const tokenRecalcSupplyJob = new TokenRecalcSupplyJob();
    await tokenRecalcSupplyJob.addToQueue([{ contract: "0", tokenId: "1" }], 10 * 1000);

    if (await HealthCheck.check()) {
      return true;
    } else {
      throw Boom.internal("Service not healthy");
    }
  },
};

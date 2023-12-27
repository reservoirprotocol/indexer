/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { eventsSyncBackfillJob } from "@/jobs/events-sync/events-sync-backfill-job";
import { regex } from "@/common/utils";

export const postSyncEventsOptions: RouteOptions = {
  description: "Trigger syncing of events.",
  tags: ["api", "x-admin"],
  timeout: {
    server: 2 * 60 * 1000,
  },
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      fromBlock: Joi.number().integer().positive().required(),
      toBlock: Joi.number().integer().positive().required(),
      // WARNING: Some events should always be fetched together!
      syncDetails: Joi.alternatives(
        Joi.object({
          method: Joi.string().valid("events"),
          events: Joi.array().items(Joi.string()),
        }),
        Joi.object({
          method: Joi.string().valid("address"),
          address: Joi.string().pattern(regex.address),
        })
      ),
      blocksPerBatch: Joi.number().integer().positive(),
      backfill: Joi.boolean().default(true),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    try {
      const fromBlock = payload.fromBlock;
      const toBlock = payload.toBlock;
      const syncDetails = payload.syncDetails;
      const backfill = payload.backfill;
      const blocksPerBatch = payload.blocksPerBatch;

      await eventsSyncBackfillJob.addToQueue(fromBlock, toBlock, {
        syncDetails,
        backfill,
        blocksPerBatch,
      });

      return { message: "Request accepted" };
    } catch (error) {
      logger.error("post-sync-events-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};

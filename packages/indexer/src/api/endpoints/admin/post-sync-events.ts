/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { regex } from "@/common/utils";
import { config } from "@/config/index";
import { processResyncRequestJob } from "@/jobs/events-sync/process-resync-request-queue-job";

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
      fromBlock: Joi.number().integer().positive().required(),
      toBlock: Joi.number().integer().positive().required(),
      blocksPerBatch: Joi.number().integer().positive(),
      skipNonFillWrites: Joi.boolean().default(false),
      backfill: Joi.boolean().default(true),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    try {
      const syncDetails = payload.syncDetails;
      const fromBlock = payload.fromBlock;
      const toBlock = payload.toBlock;
      const blocksPerBatch = payload.blocksPerBatch;
      const backfill = payload.backfill;

      await processResyncRequestJob.addToQueue(fromBlock, toBlock, {
        backfill,
        syncDetails,
        blocksPerBatch,
      });

      return { message: "Request accepted" };
    } catch (error) {
      logger.error("post-sync-events-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};

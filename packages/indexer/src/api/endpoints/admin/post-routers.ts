import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { redis } from "@/common/redis";
import { regex, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { addToQueue } from "@/jobs/backfill/backfill-router";
import { Sources } from "@/models/sources";
import { Channel } from "@/pubsub/channels";

export const postRoutersOptions: RouteOptions = {
  description: "Add a new router contract",
  tags: ["api", "x-admin"],
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      routers: Joi.array()
        .items(
          Joi.object({
            address: Joi.string().pattern(regex.address).required(),
            domain: Joi.string().pattern(regex.domain).required(),
            deploymentBlock: Joi.number().required(),
          })
        )
        .min(1)
        .required(),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = request.payload as any;

    try {
      for (const router of payload.routers) {
        const address = router.address;
        const domain = router.domain;
        const deploymentBlock = router.deploymentBlock;

        await idb.none(
          `
            INSERT INTO routers (
              address,
              source_id
            ) VALUES (
              $/address/,
              $/sourceId/
            ) ON CONFLICT DO NOTHING
          `,
          {
            address: toBuffer(address),
            sourceId: await Sources.getInstance()
              .then((sources) => sources.getOrInsert(domain))
              .then((source) => source.id),
          }
        );

        await redis.publish(Channel.RoutersUpdated, `New router ${address} (${domain})`);

        await addToQueue({
          router: address,
          fromBlock: deploymentBlock,
          toBlock: await baseProvider.getBlock("latest").then((b) => b.number),
          blockRange: 100,
        });
      }

      return { message: "Success" };
    } catch (error) {
      logger.error("post-routers", `Handler failure: ${error}`);
      throw error;
    }
  },
};

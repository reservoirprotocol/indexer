/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { RabbitMqJobsConsumer } from "@/jobs/index";

export const postRetryRabbitQueue: RouteOptions = {
  description: "Retry all the messages within the given dead letter rabbit queue",
  tags: ["api", "x-admin"],
  timeout: {
    server: 2 * 60 * 1000,
  },
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      queueName: Joi.string().description("The queue name to retry").required(),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    try {
      const retriedMessagesCount = await RabbitMqJobsConsumer.retryQueue(payload.queueName);

      return {
        message: `${retriedMessagesCount} messages in ${payload.queueName} sent to retry`,
      };
    } catch (error) {
      logger.error("post-set-community-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};

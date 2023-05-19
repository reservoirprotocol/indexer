/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { idb } from "@/common/db";
import { redis } from "@/common/redis";
import { Channel } from "@/pubsub/channels";

export const postSetApiRoutePoints: RouteOptions = {
  description: "Set points cost for an api route",
  tags: ["api", "x-admin"],
  timeout: {
    server: 2 * 60 * 1000,
  },
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      route: Joi.string().required(),
      points: Joi.number().required(),
      delete: Joi.boolean().default(false),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    try {
      const route = payload.route;
      const points = payload.points;

      if (payload.delete) {
        const query = `
          DELETE FROM api_routes_points
          WHERE route = $/route/
        `;

        await idb.none(query, { route, points });
        await redis.publish(Channel.RouteApiPointsUpdated, `Delete route points`);
      } else {
        const query = `
          INSERT INTO api_routes_points (route, points)
          VALUES($/route/, $/points/)
          ON CONFLICT (route) DO UPDATE SET points = EXCLUDED.points
        `;

        await idb.none(query, { route, points });
        await redis.publish(
          Channel.RouteApiPointsUpdated,
          `Updated route ${route} to cost ${points} points`
        );
      }

      return { message: "Request accepted" };
    } catch (error) {
      logger.error("post-set-api-route-points-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};

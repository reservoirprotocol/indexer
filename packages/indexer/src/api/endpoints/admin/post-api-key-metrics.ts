/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import JoiBase from "joi";
import JoiDate from "@joi/date";
import _ from "lodash";
import { logger } from "@/common/logger";
import { redb } from "@/common/db";
import { sub } from "date-fns";
import { config } from "@/config/index";
import * as Boom from "@hapi/boom";

const Joi = JoiBase.extend(JoiDate);

export const postApiKeyMetrics: RouteOptions = {
  description: "Get API usage metrics for the given API key",
  notes: "Get API usage metrics for the given API key",
  tags: ["api", "x-admin"],
  plugins: {
    "hapi-swagger": {
      payloadType: "form",
      orders: 13,
    },
  },
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      keys: Joi.alternatives()
        .try(
          Joi.array().items(Joi.string().uuid()).min(1).max(1000).description("Array API keys"),
          Joi.string().uuid().description("Array API keys")
        )
        .required(),
      granularity: Joi.string()
        .valid("hourly", "daily", "monthly")
        .default("monthly")
        .description(
          "Return results by either hourly/daily/monthly granularity.<br>Hourly will return time in format YYYY-MM-DDTHH:00:000Z<br>Daily will return time in format YYYY-MM-DDT00:00:000Z<br>Monthly will return time in format YYYY-MM-01T00:00:000Z<br>"
        ),
      groupBy: Joi.number()
        .default(1)
        .valid(1, 2, 3, 4)
        .description(
          "1 - All calls per hour/day/month<br>2 - All calls per key per hour/day/month<br>3 - All calls per key per route per hour/day/month<br>4 - All calls per key per route per status code per hour/day/month<br>"
        ),
      startTime: Joi.date()
        .format("YYYY-MM-DD HH:00")
        .description(
          "Get metrics after a particular time (allowed format YYYY-MM-DD HH:00)<br>Hourly default to last 24 hours<br>Daily default to last 7 days<br>Monthly default to last 12 months"
        ),
      endTime: Joi.date()
        .format("YYYY-MM-DD HH:00")
        .description("Get metrics before a particular time (allowed format YYYY-MM-DD HH:00)"),
    }),
  },
  response: {
    schema: Joi.object({
      metrics: Joi.array().items(
        Joi.object({
          time: Joi.string(),
          apiCallsCount: Joi.number(),
          pointsConsumed: Joi.number(),
          key: Joi.string().uuid().optional(),
          route: Joi.string().optional(),
          statusCode: Joi.number().optional(),
        })
      ),
    }).label("postApiKeyMetricsResponse"),
    failAction: (_request, _h, error) => {
      logger.error("post-api-key-metrics-handler", `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    let tableName = "monthly_api_usage";
    let timeColumnName = "month";

    switch (payload.granularity) {
      case "hourly":
        tableName = "hourly_api_usage";
        timeColumnName = "hour";
        payload.startTime = payload.startTime
          ? payload.startTime
          : sub(new Date(), {
              hours: 24,
            }).toISOString();
        break;

      case "daily":
        tableName = "daily_api_usage";
        timeColumnName = "day";
        payload.startTime = payload.startTime
          ? payload.startTime
          : sub(new Date(), {
              days: 7,
            }).toISOString();
        break;

      case "monthly":
        payload.startTime = payload.startTime
          ? payload.startTime
          : sub(new Date(), {
              months: 12,
            }).toISOString();
        break;
    }

    let select = "";
    let groupBy = "";

    switch (payload.groupBy) {
      case 1:
        select = `${timeColumnName}, SUM(api_calls_count) AS "api_calls_count", SUM(points) AS "points_consumed"`;
        groupBy = `GROUP BY ${timeColumnName}`;
        break;

      case 2:
        select = `${timeColumnName}, api_key, SUM(api_calls_count) AS "api_calls_count", SUM(points) AS "points_consumed"`;
        groupBy = `GROUP BY ${timeColumnName}, api_key`;
        break;

      case 3:
        select = `${timeColumnName}, api_key, route, SUM(api_calls_count) AS "api_calls_count", SUM(points) AS "points_consumed"`;
        groupBy = `GROUP BY ${timeColumnName}, api_key, route`;
        break;

      case 4:
        select = `${timeColumnName}, api_key, route, status_code, SUM(api_calls_count) AS "api_calls_count", SUM(points) AS "points_consumed"`;
        groupBy = `GROUP BY ${timeColumnName}, api_key, route, status_code`;
        break;
    }

    const baseQuery = `
      SELECT ${select}
      FROM ${tableName}
      WHERE api_key IN ($/keys:csv/)
      ${payload.startTime ? `AND ${timeColumnName} >= $/startTime/` : ``}
      ${payload.endTime ? `AND ${timeColumnName} <= $/endTime/` : ``}
      ${groupBy}
      ORDER BY ${timeColumnName} ASC
    `;

    try {
      const metrics = await redb.manyOrNone(baseQuery, payload);

      return {
        metrics: _.map(metrics, (metric) => ({
          time: metric[timeColumnName].toISOString(),
          apiCallsCount: _.toNumber(metric.api_calls_count),
          pointsConsumed: _.toNumber(metric.points_consumed),
          key: metric?.api_key,
          route: metric?.route,
          statusCode: metric?.status_code,
        })),
      };
    } catch (error) {
      logger.error("post-api-key-metrics-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};

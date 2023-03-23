/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import JoiBase from "joi";
import JoiDate from "@joi/date";
import _ from "lodash";
import { logger } from "@/common/logger";
import { redb } from "@/common/db";
import { sub } from "date-fns";

const Joi = JoiBase.extend(JoiDate);

export const getApiKeyMetrics: RouteOptions = {
  description: "Get API usage metrics for the given API key",
  notes: "Get API usage metrics for the given API key",
  tags: ["api", "Management"],
  plugins: {
    "hapi-swagger": {
      payloadType: "form",
      orders: 13,
    },
  },
  validate: {
    query: Joi.object({
      keys: Joi.alternatives()
        .try(
          Joi.array().items(Joi.string().uuid()).min(1).max(50).description("Array API keys"),
          Joi.string().uuid().description("Array API keys")
        )
        .required(),
      granularity: Joi.string()
        .valid("hourly", "daily", "monthly")
        .default("monthly")
        .description(
          "Return results grouped by either hourly/daily/monthly.<br>Hourly will return time in format YYYY-MM-DDTHH:00:000Z<br>Daily will return time in format YYYY-MM-DDT00:00:000Z<br>Monthly will return time in format YYYY-MM-01T00:00:000Z"
        ),
      groupBy: Joi.number()
        .default(1)
        .valid(1, 2, 3, 4)
        .description(
          "1 - All calls per hour/day/month<br>2 - All calls per key per hour/day/month<br>3 - All calls per key per route per hour/day/month<br>4 - All calls per key per route per status code per hour/day/month"
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
          key: Joi.string().uuid().optional(),
          route: Joi.string().optional(),
          statusCode: Joi.number().optional(),
        })
      ),
    }).label("getApiKeyMetricsResponse"),
    failAction: (_request, _h, error) => {
      logger.error("get-api-key-metrics-handler", `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    let tableName = "monthly_api_usage";
    let timeColumnName = "month";

    switch (query.granularity) {
      case "hourly":
        tableName = "hourly_api_usage";
        timeColumnName = "hour";
        query.startTime = query.startTime
          ? query.startTime
          : sub(new Date(), {
              hours: 24,
            }).toISOString();
        break;

      case "daily":
        tableName = "daily_api_usage";
        timeColumnName = "day";
        query.startTime = query.startTime
          ? query.startTime
          : sub(new Date(), {
              days: 7,
            }).toISOString();
        break;

      case "monthly":
        query.startTime = query.startTime
          ? query.startTime
          : sub(new Date(), {
              months: 12,
            }).toISOString();
        break;
    }

    let select = "";
    let groupBy = "";

    switch (query.groupBy) {
      case 1:
        select = `${timeColumnName}, SUM(api_calls_count) AS "api_calls_count"`;
        groupBy = `GROUP BY ${timeColumnName}`;
        break;

      case 2:
        select = `${timeColumnName}, api_key, SUM(api_calls_count) AS "api_calls_count"`;
        groupBy = `GROUP BY ${timeColumnName}, api_key`;
        break;

      case 3:
        select = `${timeColumnName}, api_key, route, SUM(api_calls_count) AS "api_calls_count"`;
        groupBy = `GROUP BY ${timeColumnName}, api_key, route`;
        break;

      case 4:
        select = `${timeColumnName}, api_key, route, status_code, SUM(api_calls_count) AS "api_calls_count"`;
        groupBy = `GROUP BY ${timeColumnName}, api_key, route, status_code`;
        break;
    }

    const baseQuery = `
      SELECT ${select}
      FROM ${tableName}
      WHERE api_key IN ($/keys:csv/)
      ${query.startTime ? `AND ${timeColumnName} >= $/startTime/` : ``}
      ${query.endTime ? `AND ${timeColumnName} <= $/endTime/` : ``}
      ${groupBy}
      ORDER BY ${timeColumnName} ASC
    `;

    try {
      const metrics = await redb.manyOrNone(baseQuery, query);

      return {
        metrics: _.map(metrics, (metric) => ({
          time: metric[timeColumnName].toISOString(),
          apiCallsCount: _.toNumber(metric.api_calls_count),
          key: metric?.api_key,
          route: metric?.route,
          statusCode: metric?.status_code,
        })),
      };
    } catch (error) {
      logger.error("get-api-key-metrics-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};

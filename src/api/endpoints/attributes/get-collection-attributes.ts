import { Request, ResponseToolkit, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import * as queries from "@/entities/attributes/get-collection-attributes";

export const getCollectionAttributesOptions: RouteOptions = {
  description:
    "Explore the top attribute values, across a whole collection or within a single attribute key",
  tags: ["api", "attributes"],
  timeout: {
    server: 30 * 1000,
  },
  validate: {
    params: Joi.object({
      collection: Joi.string().lowercase().required(),
    }),
    query: Joi.object({
      attribute: Joi.string(),
      sortBy: Joi.string().valid(
        "value",
        "floorSellValue",
        "floorCap",
        "topBuyValue"
      ),
      sortDirection: Joi.string()
        .lowercase()
        .valid("asc", "desc")
        .default("asc"),
      offset: Joi.number().integer().min(0).default(0),
      limit: Joi.number().integer().min(1).default(20),
    }),
  },
  response: {
    schema: Joi.object({
      attributes: Joi.array().items(
        Joi.object({
          key: Joi.string(),
          value: Joi.string().allow(""),
          tokenCount: Joi.number(),
          onSaleCount: Joi.number(),
          sampleImages: Joi.array().items(Joi.string().allow(null, "")),
          lastSells: Joi.array().items(
            Joi.object({
              value: Joi.number().unsafe(),
              block: Joi.number(),
            })
          ),
          lastBuys: Joi.array().items(
            Joi.object({
              value: Joi.number().unsafe(),
              block: Joi.number(),
            })
          ),
          floorSellValues: Joi.array().items(Joi.number().unsafe()),
          topBuy: Joi.object({
            hash: Joi.string().allow(null),
            value: Joi.number().unsafe().allow(null),
            maker: Joi.string().allow(null),
            validFrom: Joi.number().allow(null),
          }),
        })
      ),
    }).label("getCollectionAttributesResponse"),
    failAction: (_request, _h, error) => {
      logger.error(
        "get_collection_attributes_handler",
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request, h: ResponseToolkit) => {
    const params = request.params as any;
    const query = request.query as any;

    try {
      const attributes = await queries.getCollectionAttributes({
        ...params,
        ...query,
      } as queries.GetCollectionAttributesFilter);

      return h
        .response({ attributes })
        .header("Cache-Control", "max-age=1, stale-while-revalidate=10800");
    } catch (error) {
      logger.error(
        "get_collection_attributes_handler",
        `Handler failure: ${error}`
      );
      throw error;
    }
  },
};

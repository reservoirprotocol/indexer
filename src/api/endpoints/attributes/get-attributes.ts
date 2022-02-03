import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import * as queries from "@/entities/attributes/get-attributes";

export const getAttributesOptions: RouteOptions = {
  cache: {
    privacy: "public",
    expiresIn: 30000,
  },
  description:
    "Get ALL attributes in a collection, and their counts. Useful for displaying filtering options.",
  tags: ["api", "attributes"],
  validate: {
    query: Joi.object({
      collection: Joi.string().lowercase().required(),
    }),
  },
  response: {
    schema: Joi.object({
      attributes: Joi.array().items(
        Joi.object({
          key: Joi.string(),
          kind: Joi.string(),
          values: Joi.array().items(
            Joi.object({
              value: Joi.string().allow(""),
              count: Joi.number(),
            })
          ),
        })
      ),
    }).label("getAttributesResponse"),
    failAction: (_request, _h, error) => {
      logger.error("get_attributes_handler", `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const attributes = await queries.getAttributes(
        query as queries.GetAttributesFilter
      );

      return { attributes };
    } catch (error) {
      logger.error("get_attributes_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};

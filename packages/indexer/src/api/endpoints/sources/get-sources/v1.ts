/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { Sources } from "@/models/sources";
import { buildContinuation, regex, splitContinuation } from "@/common/utils";
import { SourcesEntity } from "@/models/sources/sources-entity";

const version = "v1";

export const getSourcesV1Options: RouteOptions = {
  description: "Sources List",
  notes: "This API returns a list of sources",
  tags: ["api", "Sources"],
  plugins: {
    "hapi-swagger": {
      order: 1,
    },
  },
  validate: {
    query: Joi.object({
      sortBy: Joi.string()
        .valid("domain", "createdAt")
        .default("createdAt")
        .description("Order of the items are returned in the response."),
      sortDirection: Joi.string()
        .valid("asc", "desc")
        .default("desc")
        .description("Order the items are returned in the response."),
      domain: Joi.string()
        .lowercase()
        .description("Filter to a particular domain. Example: `x2y2.io`"),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(100)
        .default(20)
        .description("Amount of items returned in response."),
      continuation: Joi.string().pattern(regex.base64),
    }),
  },
  response: {
    schema: Joi.object({
      sources: Joi.array().items(
        Joi.object({
          id: Joi.string(),
          name: Joi.string().allow("", null),
          description: Joi.string().allow("", null),
          socialImage: Joi.string().allow("", null),
          twitterUsername: Joi.string().allow("", null),
          icon: Joi.string().allow("", null),
          tokenUrl: Joi.string().allow("", null),
          domain: Joi.string().allow("", null),
        })
      ),
      continuation: Joi.string().allow(null),
    }).label(`getSources${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-sources-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;
    let sourcesFilter = "";
    let offset = 0;
    if (query.domain) {
      sourcesFilter = `domain = $/domain/`;
    }
    if (query.continuation) {
      offset = Number(splitContinuation(query.continuation));
    }
    try {
      let baseQuery = `SELECT "name", "address", "domain", "metadata" from "sources_v2" ${
        sourcesFilter ? "WHERE " + sourcesFilter : ""
      }`;

      baseQuery += ` ORDER BY sources_v2.${
        query.sortBy === "createdAt" ? "created_at" : query.sortBy
      } ${query.sortDirection}`;

      baseQuery += ` OFFSET ${offset} LIMIT ${query.limit}`;

      const rawResult = await redb.manyOrNone(baseQuery, query);
      const sources = await Sources.getInstance();

      const result = await Promise.all(
        rawResult.map(async (r) => {
          const source = new SourcesEntity(r);
          return {
            id: source.address ?? undefined,
            name: source?.getTitle(),
            description: source?.metadata.description,
            socialImage: source?.metadata.socialImage,
            twitterUsername: source?.metadata.twitterUsername,
            icon: source?.getIcon(),
            domain: source.domain ?? undefined,
            tokenUrl: sources.getTokenUrl(source),
          };
        })
      );
      let continuation: string | null = null;
      if (rawResult.length >= query.limit) {
        continuation = offset + query.limit;
      }
      return {
        sources: result,
        continuation: continuation ? buildContinuation(continuation.toString()) : undefined,
      };
    } catch (error) {
      logger.error(`get-sources-listings-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};

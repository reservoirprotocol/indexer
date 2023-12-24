/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import {
  getEnhancedEventsFromTx,
  extractOnChainData,
} from "@/events-sync/handlers/royalties/utils";

export const eventParsingOptions: RouteOptions = {
  description: "Event Parsing",
  tags: ["debug"],
  plugins: {
    "hapi-swagger": {
      order: 1,
    },
  },
  validate: {
    query: Joi.object({
      tx: Joi.string(),
      skipProcessing: Joi.boolean().default(true),
    }),
  },
  response: {},
  handler: async (request: Request) => {
    const query = request.query as any;
    try {
      const events = await getEnhancedEventsFromTx(query.tx);
      const onChainData = await extractOnChainData(events, query.skipProcessing);
      return {
        events,
        onChainData,
      };
    } catch (error) {
      return { error };
    }
  },
};

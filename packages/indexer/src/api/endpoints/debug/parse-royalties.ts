/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { assignRoyaltiesToFillEvents } from "@/events-sync/handlers/royalties";
import { getFillEventsFromTx } from "@/events-sync/handlers/royalties/utils";

export const parseRoyaltiesOptions: RouteOptions = {
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
      const { fillEvents } = await getFillEventsFromTx(query.tx);
      await assignRoyaltiesToFillEvents(fillEvents, false, true);
      return {
        fillEvents,
      };
    } catch (error) {
      return { error };
    }
  },
};

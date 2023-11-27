/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import {Request, RouteOptions} from "@hapi/hapi";
import Joi from "joi";

import {logger} from "@/common/logger";
import {config} from "@/config/index";
import {eventsSyncRealtimeJob} from "@/jobs/events-sync/events-sync-realtime-job";

export const postSyncEventsRealtimeOptions: RouteOptions = {
    description: "Trigger syncing of events.",
    tags: ["api", "x-admin"],
    timeout: {
        server: 2 * 60 * 1000,
    },
    validate: {
        headers: Joi.object({
            "x-admin-api-key": Joi.string().required(),
        }).options({allowUnknown: true}),
        payload: Joi.object({
            fromBlock: Joi.number().integer().positive().required(),
            toBlock: Joi.number().integer().positive().required(),
        }),
    },
    handler: async (request: Request) => {
        if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
            throw Boom.unauthorized("Wrong or missing admin API key");
        }
        const payload = request.payload as any;

        try {
            const fromBlock = payload.fromBlock;
            const toBlock = payload.toBlock;

            for (var i = fromBlock; i <= toBlock; i++) {
                await eventsSyncRealtimeJob.addToQueue({block: i})
            }
            return {message: "Request accepted"};
        } catch (error) {
            logger.error("post-sync-events-realtime-handler", `Handler failure: ${error}`);
            throw error;
        }
    },
};

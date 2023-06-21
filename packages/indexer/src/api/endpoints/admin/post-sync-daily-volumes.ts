/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { DailyVolume } from "@/models/daily-volumes/daily-volume";
import { dailyVolumeJob } from "@/jobs/daily-volumes/daily-volumes-job";

export const postSyncDailyVolumes: RouteOptions = {
  description:
    "Trigger a re-sync of daily volume calculations, " +
    "volumes should only be calculated when fill_events have been fully synced",
  tags: ["api", "x-admin"],
  timeout: {
    server: 2 * 60 * 1000,
  },
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      days: Joi.number()
        .integer()
        .positive()
        .default(0)
        .description("If no days are passed, will automatically resync from beginning of time."),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    try {
      let days = 0;
      if (payload.days) {
        days = payload.days;
      }

      // Get the current day timestamp
      const date = new Date();
      date.setUTCHours(0, 0, 0, 0);
      const currentDay = date.getTime() / 1000;

      // If no days are set, lets take the earliest fill_event that we have in the database
      // we calculate from that time onwards
      let startDay = 0;
      if (!days) {
        const values = await redb.oneOrNone(`SELECT MIN(timestamp) as earliest FROM fill_events_2`);
        if (values) {
          const earliestDate = new Date(values.earliest);
          earliestDate.setUTCHours(0, 0, 0, 0);
          startDay = earliestDate.getTime(); // Don't divide by 1000, it's already in seconds because the db is in secs
        }
        days = (currentDay - startDay) / (3600 * 24);
      } else {
        startDay = currentDay - days * 3600 * 24;
      }

      if (!(await DailyVolume.initiateLock(days))) {
        return {
          message:
            "Job to update daily volumes is already running, please wait until it's finished",
        };
      }

      // Trigger a sync job for each day
      for (let x: number = startDay; x < currentDay; x = x + 3600 * 24) {
        await dailyVolumeJob.addToQueue({ startTime: x, ignoreInsertedRows: true });
      }

      return { message: "Request accepted" };
    } catch (error) {
      logger.error("post-sync-daily-volumes", `Handler failure: ${error}`);
      throw error;
    }
  },
};

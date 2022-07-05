import { config } from "@/config/index";
import { redb } from "@/common/db";

import * as exportData from "@/jobs/data-export/export-data";

import "@/jobs/data-export/export-data";
import cron from "node-cron";
import { redlock } from "@/common/redis";

const getTasks = async () => {
  return await redb.manyOrNone(`SELECT source FROM data_export_tasks`);
};

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  getTasks()
    .then(async (tasks) => {
      for (const task of tasks) {
        cron.schedule(
          "*/10 * * * *",
          async () =>
            await redlock
              .acquire([`data-export-${task.source}-cron-lock`], (10 * 60 - 5) * 1000)
              .then(async () => {
                await exportData.addToQueue(task.source);
              })
              .catch(() => {
                // Skip on any errors
              })
        );
      }
    })
    .catch(() => {
      // Skip on any errors
    });
}

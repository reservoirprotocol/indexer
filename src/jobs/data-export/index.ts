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
  cron.schedule(
    "*/5 * * * *",
    async () =>
      await redlock
        .acquire([`data-export-cron-lock`], (5 * 60 - 5) * 1000)
        .then(async () => {
          getTasks()
            .then(async (tasks) => {
              for (const task of tasks) {
                await exportData.addToQueue(task.source);
              }
            })
            .catch(() => {
              // Skip on any errors
            });
        })
        .catch(() => {
          // Skip on any errors
        })
  );
}

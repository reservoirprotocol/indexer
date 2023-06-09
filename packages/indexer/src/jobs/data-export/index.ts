import { config } from "@/config/index";
import { redb } from "@/common/db";

import "@/jobs/data-export/export-data";
import cron from "node-cron";
import { redlock } from "@/common/redis";
import { exportDataJob } from "@/jobs/data-export/export-data-job";

const getTasks = async () => {
  return await redb.manyOrNone(`SELECT id FROM data_export_tasks WHERE is_active = TRUE`);
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
                await exportDataJob.addToQueue({ taskId: task.id });
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

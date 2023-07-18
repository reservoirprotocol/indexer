import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { config } from "@/config/index";
import { elasticsearch } from "@/common/elasticsearch";
import { logger } from "@/common/logger";

export type MonitorReindexActivitiesJobPayload = {
  taskId: string;
};

export class MonitorReindexActivitiesJob extends AbstractRabbitMqJobHandler {
  queueName = "monitor-reindex-activities-queue";
  maxRetries = 10;
  concurrency = 1;
  persistent = true;
  lazyMode = true;
  useSharedChannel = true;

  protected async process(payload: MonitorReindexActivitiesJobPayload) {
    const task = await elasticsearch.tasks.get({ task_id: payload.taskId });

    if (task.completed) {
      if (task.response?.failures?.length) {
        logger.info(
          this.queueName,
          JSON.stringify({
            message: "Task Completed!",
            task,
          })
        );
      } else {
        logger.info(
          this.queueName,
          JSON.stringify({
            message: "Task Failed!",
            task,
          })
        );
      }
    } else {
      logger.info(
        this.queueName,
        JSON.stringify({
          message: "Task Pending!",
          task,
        })
      );

      await this.addToQueue(payload.taskId, 60000);
    }
  }

  public async addToQueue(taskId: string, delay = 0) {
    if (!config.doElasticsearchWork) {
      return;
    }

    await this.send({ payload: { taskId } }, delay);
  }
}

export const monitorReindexActivitiesJob = new MonitorReindexActivitiesJob();

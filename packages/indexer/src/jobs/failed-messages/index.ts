import { config } from "@/config/index";
import cron from "node-cron";
import { FailedPublishMessages } from "@/models/failed-publish-messages-list";
import _ from "lodash";
import { RabbitMq, RabbitMQMessage } from "@/common/rabbit-mq";
import { acquireLock, releaseLock } from "@/common/redis";
import { logger } from "@/common/logger";

if (config.doBackgroundWork) {
  cron.schedule("*/5 * * * * *", async () => {
    const limit = 500;
    const lockName = "republish-failed-messaged";
    const failedPublishMessages = new FailedPublishMessages();
    let messages = await failedPublishMessages.get(limit);

    if (!_.isEmpty(messages)) {
      // If messages are pending to be republished get a lock and publish all pending messages
      if (!(await acquireLock(lockName, 60 * 60 * 10))) {
        return;
      }

      do {
        logger.info("rabbit-message-republish", `republishing ${messages.length} messages`);
        const mergedMessagesByQueue: { [key: string]: RabbitMQMessage[] } = {};

        // Merge messages by queue
        for (const msg of messages) {
          if (_.has(mergedMessagesByQueue, msg.queue)) {
            mergedMessagesByQueue[msg.queue].push(msg.payload);
          } else {
            mergedMessagesByQueue[msg.queue] = [msg.payload];
          }
        }

        // Republish messages in batches
        for (const [queue, payload] of Object.entries(mergedMessagesByQueue)) {
          await RabbitMq.sendBatch(
            queue,
            payload.map((p) => ({ content: p }))
          );
        }

        messages = await failedPublishMessages.get(limit); // Get the next batch of failed messages
      } while (!_.isEmpty(messages));

      // Done republishing
      await releaseLock(lockName);
    }
  });
}

import { Kafka, logLevel } from "kafkajs";

import { config } from "@/config/index";
import { TopicHandlers } from "@/jobs/cdc/topics";
import { logger } from "@/common/logger";
import { getServiceName } from "@/config/network";

const kafka = new Kafka({
  clientId: config.kafkaClientId,
  brokers: config.kafkaBrokers,
  logLevel: logLevel.ERROR,
});

export const producer = kafka.producer();
export const consumer = kafka.consumer({
  groupId: config.kafkaConsumerGroupId,
});

export async function startKafkaProducer(): Promise<void> {
  logger.info(`${getServiceName()}-kafka`, "Starting Kafka producer");
  await producer.connect();
}

export async function startKafkaConsumer(): Promise<void> {
  logger.info(`${getServiceName()}-kafka`, "Starting Kafka consumer");
  await consumer.connect();

  const topicsToSubscribe = TopicHandlers.map((topicHandler) => {
    return topicHandler.getTopics();
  }).flat();

  // Do this one at a time, as sometimes the consumer will re-create a topic that already exists if we use the method to subscribe to all topics at once and
  // one of the topics do not exist.
  await Promise.all(
    topicsToSubscribe.map(async (topic) => {
      await consumer.subscribe({ topic });
    })
  );

  await consumer.run({
    partitionsConsumedConcurrently: config.kafkaPartitionsConsumedConcurrently,

    eachMessage: async ({ message, topic }) => {
      try {
        const eventValues = JSON.parse(message.value!.toString());
        const keyValue = JSON.parse(message.key!.toString());

        // Find the corresponding topic handler and call the handle method on it, if the topic is not a dead letter topic
        if (topic.endsWith("-dead-letter")) {
          // if topic is dead letter, no need to process it
          logger.info(
            `${getServiceName()}-kafka-consumer`,
            `Dead letter topic=${topic}, message=${JSON.stringify(event)}`
          );
          return;
        }

        for (const handler of TopicHandlers) {
          if (handler.getTopics().includes(topic)) {
            // If the event has not been retried before, set the retryCount to 0
            if (!eventValues.payload.retryCount) {
              eventValues.payload.retryCount = 0;
            }

            await handler.handle(eventValues, keyValue);
            break;
          } else {
            logger.error(
              `${getServiceName()}-kafka-consumer`,
              `No handler found for topic=${topic}`
            );

            // If the event has an issue with finding its corresponding topic handler, send it to the dead letter queue
            throw new Error(`No handler found for topic=${topic}`);
          }
        }
      } catch (error) {
        logger.error(
          `${getServiceName()}-kafka-consumer`,
          `Error handling topic=${topic}, ${error}`
        );

        const newMessage = {
          error: JSON.stringify(error),
          ...message,
        };

        // If the event has an issue with finding its corresponding topic handler, send it to the dead letter queue
        await producer.send({
          topic: `${topic}-dead-letter`,
          messages: [newMessage],
        });
      }
    },
  });
}

// This can be used to restart the Kafka consumer, for example if the consumer is disconnected, or if we need to subscribe to new topics as
// we cannot subscribe to new topics while the consumer is running.
export async function restartKafkaConsumer(): Promise<void> {
  await consumer.disconnect();
  await startKafkaConsumer();
}

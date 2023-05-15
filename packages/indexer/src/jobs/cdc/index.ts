import { Kafka, logLevel } from "kafkajs";

import { config } from "@/config/index";
import { TopicHandlers } from "@/jobs/cdc/topics";
import { logger } from "@/common/logger";
import { getServiceName } from "@/config/network";

// Create a Kafka client
const kafka = new Kafka({
  clientId: config.kafkaClientId,
  brokers: config.kafkaBrokers,
  logLevel: logLevel.ERROR,
});

export const producer = kafka.producer();
export const consumer = kafka.consumer({
  groupId: config.kafkaConsumerGroupId,
});
// Function to start the Kafka producer
export async function startKafkaProducer(): Promise<void> {
  await producer.connect();
}

// // Function to start the Kafka consumer
export async function startKafkaConsumer(): Promise<void> {
  await consumer.connect();

  const topicsToSubscribe = TopicHandlers.map((topicHandler) => {
    return topicHandler.getTopics();
  }).flat();

  // Do this one at a time, as sometimes the consumer will re-create a topic that already exists if we use the method to subscribe to all topics at once
  await Promise.all(
    topicsToSubscribe.map(async (topic) => {
      await consumer.subscribe({ topic });
    })
  );

  // Subscribe to the topics
  await consumer.run({
    partitionsConsumedConcurrently: 1,

    eachMessage: async ({ message, topic }) => {
      try {
        const event = JSON.parse(message.value!.toString());

        // eslint-disable-next-line no-console
        console.log(`${getServiceName()}-kafka-consumer`, `Received event: ${topic}`);

        // Find the corresponding topic handler and call the handle method on it, if the topic is not a dead letter topic
        if (topic.endsWith("-dead-letter")) {
          // if topic is dead letter, no need to process it
          return;
        }

        for (const handler of TopicHandlers) {
          if (handler.getTopics().includes(topic)) {
            // If the event has not been retried before, set the retryCount to 0
            if (!event.payload.retryCount) {
              event.payload.retryCount = 0;
            }

            await handler.handle(event.payload);

            break;
          }
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.log(
          `${getServiceName()}-kafka-consumer`,
          `Error handling topic=${topic}, ${error}`
        );

        logger.error(
          `${getServiceName()}-kafka-consumer`,
          `Error handling topic=${topic}, ${error}`
        );
      }
    },
  });
}

// This can be used to restart the Kafka consumer, for example if the consumer is disconnected, or if we need to subscribe to new topics
export async function restartKafkaConsumer(): Promise<void> {
  await consumer.disconnect();
  await startKafkaConsumer();
}

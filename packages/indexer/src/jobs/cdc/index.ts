/* eslint-disable @typescript-eslint/no-explicit-any */

import { getServiceName } from "@/config/network";
import { logger } from "@/common/logger";
import { TopicHandlers } from "@/jobs/cdc/topics";
import { config } from "@/config/index";
import { kafkaConsumer, kafkaProducer } from "@/common/kafka";

// Function to start the Kafka producer
export async function startKafkaProducer(): Promise<void> {
  await kafkaProducer.connect();
}

// Function to start the Kafka consumer
export async function startKafkaConsumer(): Promise<void> {
  await kafkaConsumer.connect();

  // Subscribe to the topics
  await Promise.all(
    TopicHandlers.map((topicHandler) => {
      return kafkaConsumer.subscribe({ topics: topicHandler.getTopics() });
    })
  );

  await kafkaConsumer.run({
    partitionsConsumedConcurrently: config.kafkaPartitionsConsumedConcurrently || 1,
    eachMessage: async ({ message, topic }) => {
      const event = JSON.parse(message.value!.toString());

      // Find the corresponding topic handler and call the handle method on it, if the topic is not a dead letter topic

      if (topic.endsWith("-dead-letter")) {
        // if topic is dead letter, no need to process it
        return;
      }

      for (const handler of TopicHandlers) {
        if (handler.getTopics().includes(topic)) {
          try {
            // If the event has not been retried before, set the retryCount to 0
            if (!event.payload.retryCount) {
              event.payload.retryCount = 0;
            }

            await handler.handle(event.payload);
          } catch (error) {
            logger.error(
              `${getServiceName()}-kafka-consumer`,
              `Error handling eventName=${event.name}, ${error}`
            );
          }
          break;
        }
      }
    },
  });
}

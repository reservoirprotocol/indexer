/* eslint-disable @typescript-eslint/no-explicit-any */

// Create a Kafka client
import { Kafka, logLevel, ProducerRecord } from "kafkajs";
import { config } from "@/config/index";
import { logger } from "@/common/logger";
import * as delayKafkaMessagesQueue from "@/jobs/kafka/delay-kafka-messages";

export const kafka = new Kafka({
  clientId: config.kafkaClientId,
  brokers: config.kafkaBrokers,
  logLevel: logLevel.ERROR,
});

export const kafkaProducer = kafka.producer();

export type KafkaProducerRecord = ProducerRecord & {
  delay?: number;
};

export class KafkaProducer {
  public static async connect() {
    await kafkaProducer.connect();
  }

  public static async send(record: KafkaProducerRecord) {
    if (record.delay) {
      await delayKafkaMessagesQueue.addToQueue(record, record.delay);
    } else {
      await kafkaProducer.send(record);
    }
  }
}

export const kafkaConsumer = kafka.consumer({
  groupId: config.kafkaConsumerGroupId,
});

// Abstract class needed to be implemented in order to process messages from kafka
export abstract class KafkaEventHandler {
  abstract topicName: string;
  abstract maxRetries: number;

  async handle(payload: any): Promise<void> {
    try {
      await this.process(payload);
    } catch (error) {
      payload.retryCount += 1;
      let topicToSendTo = this.getErrorTopic();

      // If the event has already been retried maxRetries times, send it to the dead letter queue
      if (payload.retryCount > this.maxRetries) {
        topicToSendTo = `${this.getTopic()}-dead-letter`;
      }

      logger.error(
        this.getTopic(),
        `Error handling event: ${error}, topicToSendTo=${topicToSendTo}, payload=${JSON.stringify(
          payload
        )}, retryCount=${payload.retryCount}`
      );

      await kafkaProducer.send({
        topic: topicToSendTo,
        messages: [
          {
            value: JSON.stringify({
              error: JSON.stringify(error),
              payload,
            }),
          },
        ],
      });
    }
  }

  getTopic(): string {
    return `${config.chainId}.${this.topicName}`;
  }

  getErrorTopic(): string {
    return `${this.getTopic()}-error`;
  }

  getTopics(): string[] {
    // return this topic name, as well as an error topic name
    return [this.getTopic(), this.getErrorTopic()];
  }

  protected abstract process(payload: any): Promise<void>;
}

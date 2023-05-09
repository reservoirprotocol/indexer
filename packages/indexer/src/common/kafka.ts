// Create a Kafka client
import { Kafka, logLevel } from "kafkajs";
import { config } from "@/config/index";

export const kafka = new Kafka({
  clientId: config.kafkaClientId,
  brokers: config.kafkaBrokers,
  logLevel: logLevel.ERROR,
});

export const kafkaProducer = kafka.producer();

export const kafkaConsumer = kafka.consumer({
  groupId: config.kafkaConsumerGroupId,
});

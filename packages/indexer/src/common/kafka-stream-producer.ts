import { logger } from "@/common/logger";
import { Kafka, logLevel, Producer } from "kafkajs";
import { config } from "@/config/index";

const kafka = new Kafka({
  clientId: config.kafkaStreamClientId,
  brokers: config.kafkaStreamBrokers,
  ssl: {
    rejectUnauthorized: false,
    ca: config.kafkaStreamCertificateCa,
    key: config.kafkaStreamCertificateKey,
    cert: config.kafkaStreamCertificateCert,
  },
  logLevel: logLevel.ERROR,
});

const producer: Producer = kafka.producer();

producer.on("producer.disconnect", async (error) => {
  logger.error(
    `kafka-stream-producer`,
    JSON.stringify({
      topic: "kafka-stream",
      message: `Producer disconnected. error=${error}`,
      error,
    })
  );
  await restart();
});

export async function start(): Promise<void> {
  logger.info(
    `kafka-stream-producer`,
    JSON.stringify({
      topic: "kafka-stream",
      message: `Starting kafka producer.`,
      brokers: config.kafkaStreamBrokers,
      clientId: config.kafkaStreamClientId,
      ca: config.kafkaStreamCertificateCa,
      key: config.kafkaStreamCertificateKey,
      cert: config.kafkaStreamCertificateCert,
    })
  );

  try {
    await producer.connect();

    logger.info(
      `kafka-stream-producer`,
      JSON.stringify({
        topic: "kafka-stream",
        message: `Producer connected.`,
      })
    );
  } catch (error) {
    logger.error(
      `kafka-stream-producer`,
      JSON.stringify({
        topic: "kafka-stream",
        message: `Error connecting to kafka producer. error=${error}`,
        error,
      })
    );
  }
}
async function restart(): Promise<void> {
  try {
    await producer.disconnect();
  } catch (error) {
    logger.error(
      `kafka-stream-producer`,
      JSON.stringify({
        topic: "kafka-stream",
        message: `Error disconnecting producer. error=${error}`,
        error,
      })
    );
  }

  await start();
}

export const publish = async (
  topic: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  message: any,
  partitionKey?: string
): Promise<boolean> => {
  try {
    await producer.send({
      topic,
      messages: [{ value: JSON.stringify(message), key: partitionKey }],
    });

    return true;
  } catch (error) {
    logger.error(
      "kafka-stream-producer",
      JSON.stringify({
        topic: "kafka-stream",
        message: `Error publishing message to kafka. topic=${topic}, error=${error}`,
        kafkaTopic: topic,
        kafkaMessage: JSON.stringify(message),
        kafkaPartitionKey: partitionKey,
      })
    );

    return false;
  }
};

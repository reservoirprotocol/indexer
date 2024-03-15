import { logger } from "@/common/logger";
import { Kafka, logLevel, Producer } from "kafkajs";
import { config } from "@/config/index";

export interface KafkaMessage {
  event: string;
  changed?: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

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
  logger.error(`kafka-producer`, `Producer disconnected, error=${error}`);
  await restart();
});

export async function start(): Promise<void> {
  logger.info(
    `kafka-producer`,
    JSON.stringify({
      message: `Starting kafka producer`,
      brokers: config.kafkaStreamBrokers,
      clientId: config.kafkaStreamClientId,
      ca: config.kafkaStreamCertificateCa,
      key: config.kafkaStreamCertificateKey,
      cert: config.kafkaStreamCertificateCert,
    })
  );

  try {
    await producer.connect();
    logger.info(`kafka-producer`, "Producer connected");
  } catch (error) {
    logger.error(
      `kafka-producer`,
      JSON.stringify({
        message: `Error connecting to kafka producer, error=${error}`,
        error,
      })
    );
  }
}
async function restart(): Promise<void> {
  try {
    await producer.disconnect();
  } catch (error) {
    logger.error(`kafka-producer`, `Error disconnecting producer, error=${error}`);
  }

  await start();
}

export const publish = async (
  topic: string,
  message: KafkaMessage,
  partitionKey?: string
): Promise<void> => {
  try {
    await producer.send({
      topic,
      messages: [{ value: JSON.stringify(message), key: partitionKey }],
    });
  } catch (error) {
    logger.error(
      "publish-websocket-event",
      JSON.stringify({
        message: `Error publishing message to kafka, topic=${topic}, error=${error}`,
        topic,
        kafkaMessage: message,
        partitionKey,
      })
    );
  }
};

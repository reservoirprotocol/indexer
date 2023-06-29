import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import "@/jobs/index";
import "@/jobs/cdc/index";
import "@/common/tracer";
import "@/config/polyfills";
import "@/pubsub/index";
import "@/websockets/index";

import { start } from "@/api/index";
import { logger } from "@/common/logger";
import { config } from "@/config/index";
// import { getNetworkSettings } from "@/config/network";
import { initIndexes } from "@/elasticsearch/indexes";
import { startKafkaConsumer } from "@/jobs/cdc/index";
import { RabbitMq } from "@/common/rabbit-mq";
// import { RabbitMqJobsConsumer } from "@/jobs/index";
import { Sources } from "@/models/sources";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
process.on("unhandledRejection", (error: any) => {
  logger.error("process", `Unhandled rejection: ${error} (${error.stack})`);

  // For now, just skip any unhandled errors
  // process.exit(1);
});

export const log = (message: string) => {
  // eslint-disable-next-line
  console.log(`[${new Date().toISOString()}] ${message}`);
};

const setup = async () => {
  if (process.env.LOCAL_TESTING) {
    return;
  }

  log("Starting setup");

  log("Connecting to RabbitMQ");
  await RabbitMq.connect(); // Connect the rabbitmq
  log("Connected to RabbitMQ");
  log("Asserting queues and exchanges");
  await RabbitMq.assertQueuesAndExchanges(); // Assert queues and exchanges
  log("Asserted queues and exchanges");

  // if ((config.doKafkaWork || config.doBackgroundWork) && config.kafkaBrokers.length > 0) {
  //   await startKafkaProducer();
  // }

  if (config.doBackgroundWorkAlt) {
    log("Syncing sources");
    await Sources.syncSources();
    log("Synced sources");

    // log("Starting RabbitMQ jobs consumer");
    // await RabbitMqJobsConsumer.startRabbitJobsConsumer();
    // log("Started RabbitMQ jobs consumer");
    //
    // const networkSettings = getNetworkSettings();
    // if (networkSettings.onStartup) {
    //   log("Running network settings on startup");
    //   await networkSettings.onStartup();
    //   log("Ran network settings on startup");
    // }
  }

  log("Getting sources instance");
  await Sources.getInstance();
  log("Got sources instance");
  log("Forcing data reload");
  await Sources.forceDataReload();
  log("Forced data reload");

  if (config.doElasticsearchWork) {
    log("Initializing indexes");
    await initIndexes();
    log("Initialized indexes");
  }

  if (config.doKafkaWork) {
    log("Starting Kafka consumer");
    await startKafkaConsumer();
    log("Started Kafka consumer");
  }

  log("Finished setup");
};

setup().then(() => start());

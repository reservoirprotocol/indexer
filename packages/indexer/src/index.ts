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
import { getNetworkSettings } from "@/config/network";
import { initIndexes } from "@/elasticsearch/indexes";
import { startKafkaConsumer, startKafkaProducer } from "@/jobs/cdc/index";
import { RabbitMq } from "@/common/rabbit-mq";
import { RabbitMqJobsConsumer } from "@/jobs/index";
import { Sources } from "@/models/sources";

process.on("unhandledRejection", (error) => {
  logger.error("process", `Unhandled rejection: ${error}`);

  // For now, just skip any unhandled errors
  // process.exit(1);
});

const setup = async () => {
  if (process.env.LOCAL_TESTING) {
    return;
  }

  await RabbitMq.connect(); // Connect the rabbitmq
  await RabbitMq.assertQueuesAndExchanges(); // Assert queues and exchanges

  if (config.doBackgroundWork) {
    await Sources.syncSources();
    await RabbitMqJobsConsumer.startRabbitJobsConsumer();

    const networkSettings = getNetworkSettings();
    if (networkSettings.onStartup) {
      await networkSettings.onStartup();
    }
  }

  if (config.doKafkaWork) {
    startKafkaConsumer();
    startKafkaProducer();
  }

  await Sources.getInstance();
  await Sources.forceDataReload();

  if (config.doElasticsearchWork) {
    await initIndexes();
  }
};

setup().then(() => start());

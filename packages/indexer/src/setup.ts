/* eslint-disable no-console */

import "@/jobs/index";
import "@/jobs/cdc/index";
import "@/config/polyfills";
import "@/pubsub/index";
import "@/websockets/index";

import { start } from "@/api/index";
import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { getNetworkSettings } from "@/config/network";
import { initIndexes } from "@/elasticsearch/indexes";
import { startKafkaConsumer } from "@/jobs/cdc";
import { RabbitMqJobsConsumer } from "@/jobs/index";
import { Sources } from "@/models/sources";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
process.on("unhandledRejection", (error: any) => {
  logger.error("process", `Unhandled rejection: ${error} (${error.stack})`);

  // For now, just skip any unhandled errors
  // process.exit(1);
});

const setup = async () => {
  if (process.env.LOCAL_TESTING) {
    return;
  }

  console.log("setup - start");

  if (config.doBackgroundWork) {
    console.log("setup - worker - sync sources");

    await Sources.syncSources();

    console.log("setup - worker - startRabbitJobsConsumer");

    await RabbitMqJobsConsumer.startRabbitJobsConsumer();

    const networkSettings = getNetworkSettings();
    if (networkSettings.onStartup) {
      console.log("setup - worker - networkSettings.onStartup");

      await networkSettings.onStartup();
    }

    console.log("setup - worker - end");
  }

  console.log("setup - Sources.getInstance");

  await Sources.getInstance();

  console.log("setup - Sources.forceDataReload");

  await Sources.forceDataReload();

  if (config.doElasticsearchWork) {
    console.log("setup - initIndexes");

    await initIndexes();
  }

  if (config.doKafkaWork) {
    console.log("setup - startKafkaConsumer");

    await startKafkaConsumer();
  }

  console.log("setup - end");
};

setup().then(() => start());

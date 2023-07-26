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
import { FeeRecipients } from "@/models/fee-recipients";
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
  const start = new Date().getTime();

  console.log("setup - start");

  if (config.doBackgroundWork) {
    console.log("setup - worker - sync sources", new Date().getTime() - start);

    await Sources.syncSources();
    await FeeRecipients.syncFeeRecipients();

    console.log("setup - worker - startRabbitJobsConsumer", new Date().getTime() - start);

    await RabbitMqJobsConsumer.startRabbitJobsConsumer();

    const networkSettings = getNetworkSettings();
    if (networkSettings.onStartup) {
      console.log("setup - worker - networkSettings.onStartup", new Date().getTime() - start);

      await networkSettings.onStartup();
    }

    console.log("setup - worker - end", new Date().getTime() - start);
  }

  console.log("setup - Sources.getInstance", new Date().getTime() - start);

  await Sources.getInstance();

  console.log("setup - Sources.forceDataReload", new Date().getTime() - start);

  await Sources.forceDataReload();

  if (config.doElasticsearchWork) {
    console.log("setup - initIndexes", new Date().getTime() - start);

    await initIndexes();
  }

  if (config.doKafkaWork) {
    console.log("setup - startKafkaConsumer", new Date().getTime() - start);

    await startKafkaConsumer();
  }
  console.log("setup - end", new Date().getTime() - start);
};

setup().then(() => start());

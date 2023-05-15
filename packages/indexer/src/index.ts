import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import "@/jobs/cdc/index";
import "@/common/tracer";
import "@/config/polyfills";
import "@/jobs/index";
import "@/pubsub/index";
import "@/websockets/index";
import { initIndexes } from "@/elasticsearch/indexes";

import { start } from "@/api/index";
import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { getNetworkSettings } from "@/config/network";
import { Sources } from "@/models/sources";
import { startKafkaConsumer, startKafkaProducer } from "@/jobs/cdc/index";

process.on("unhandledRejection", (error) => {
  logger.error("process", `Unhandled rejection: ${error}`);

  // For now, just skip any unhandled errors
  // process.exit(1);
});

const setup = async () => {
  if (config.doBackgroundWork) {
    await Sources.syncSources();

    const networkSettings = getNetworkSettings();
    if (networkSettings.onStartup) {
      await networkSettings.onStartup();
    }
  }

  if (config.doKafkaWork) {
    // eslint-disable-next-line no-console
    console.log("doKafkaWork");
    startKafkaConsumer();
    startKafkaProducer();
  }

  if (config) await Sources.getInstance();
  await Sources.forceDataReload();

  if (config.doElasticsearchWork) {
    await initIndexes();
  }
};

setup().then(() => start());

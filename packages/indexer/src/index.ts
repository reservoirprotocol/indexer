import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import "@/common/tracer";
import "@/config/polyfills";
import "@/jobs/index";
import "@/pubsub/index";
import "@/websockets/index";
import "@/common/kafka";

import { start } from "@/api/index";
import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { getNetworkSettings } from "@/config/network";
import { Sources } from "@/models/sources";
import { KafkaCdc } from "@/jobs/cdc";
import { KafkaMq } from "@/jobs/index";

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

  await KafkaMq.startKafkaJobsProducer();

  // Kafka work to handle async jobs processing
  if (config.doKafkaWork) {
    await KafkaMq.startKafkaJobsConsumer();
  }

  // Kafka work to handle DB CDC changes
  if (config.doKafkaCdcWork) {
    await KafkaCdc.startKafkaCdcProducer();
    await KafkaCdc.startKafkaCdcConsumer();
  }

  await Sources.getInstance();
  await Sources.forceDataReload();
};

setup().then(() => start());

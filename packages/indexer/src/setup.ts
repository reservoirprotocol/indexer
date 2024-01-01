import "@/jobs/index";
import "@/jobs/cdc/index";
import "@/config/polyfills";
import "@/pubsub/index";
import "@/websockets/index";

import * as Sdk from "@reservoir0x/sdk";
import _ from "lodash";

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
  // Configure the SDK
  Sdk.Global.Config.aggregatorSource = "reservoir.tools";

  if (process.env.LOCAL_TESTING == "1") {
    return;
  }

  if (config.doBackgroundWork || config.forceEnableRabbitJobsConsumer) {
    const start = _.now();
    await RabbitMqJobsConsumer.startRabbitJobsConsumer();
    logger.info("rabbit-timing", `rabbit consuming started in ${_.now() - start}ms`);
  }

  if (config.doBackgroundWork) {
    await Sources.syncSources();
    await FeeRecipients.syncFeeRecipients();
    const networkSettings = getNetworkSettings();
    if (networkSettings.onStartup) {
      await networkSettings.onStartup();
    }
  }

  await Sources.getInstance();
  await Sources.forceDataReload();

  if (config.doElasticsearchWork) {
    await initIndexes();
  }

  if (config.doKafkaWork) {
    await startKafkaConsumer();
  }
};

setup().then(() => start());

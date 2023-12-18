import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import "@/common/tracer";

import { RabbitMq } from "@/common/rabbit-mq";
import { acquireLock, redis } from "@/common/redis";
import { config } from "@/config/index";
import { logger } from "@/common/logger";
import _ from "lodash";

logger.info("trace", `using current chain-id: ${config.chainId}`);

if (process.env.LOCAL_TESTING == "1") {
  logger.warn("trace", `running in TESTING mode with chain-id: ${config.chainId}`);
  import("./setup");
} else {
  RabbitMq.createVhost()
    .then(() => RabbitMq.connect())
    .then(async () => {
      logger.info("trace", `after rabbit connection with chain-id: ${config.chainId}`);
      // Sync the pods so rabbit queues assertion will run only once per deployment by a single pod
      if (await acquireLock(config.imageTag, 75)) {
        const start = _.now();
        logger.info("rabbit-timing", `rabbit assertion starting in ${start}`);
        await RabbitMq.assertQueuesAndExchanges();
        logger.info("rabbit-timing", `rabbit assertion done in ${_.now() - start}ms`);
        await redis.set(config.imageTag, "DONE", "EX", 60 * 60 * 24); // Update the lock ttl
        import("./setup");
      } else {
        logger.info(
          "trace",
          `polling rabbit-queues-ready without race-lock with chain-id: ${config.chainId}`
        );
        // Check every 1s if the rabbit queues assertion completed
        const intervalId = setInterval(async () => {
          if ((await redis.get(config.imageTag)) === "DONE") {
            clearInterval(intervalId);
            import("./setup");
          }
        }, 1000);
      }
    })
    .catch((error) => {
      logger.error("rabbit-publisher-connect", `Error connecting to rabbit ${error}`);
    });
}

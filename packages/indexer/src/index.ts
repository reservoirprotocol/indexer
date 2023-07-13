import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import "@/common/tracer";

import { RabbitMq } from "@/common/rabbit-mq";
import { acquireLock, redis } from "@/common/redis";
import { config } from "@/config/index";

if (process.env.LOCAL_TESTING) {
  import("./setup");
} else {
  RabbitMq.connect().then(async () => {
    // Sync the pods so rabbit queues assertion will run only once per deployment by a single pod
    if (await acquireLock(config.imageTag, 75)) {
      await RabbitMq.assertQueuesAndExchanges();
      await redis.set(config.imageTag, "DONE", "EX", 60 * 60 * 24);
      import("./setup");
    } else {
      // Check every 1s if the rabbit queues assertion completed
      const intervalId = setInterval(async () => {
        if ((await redis.get(config.imageTag)) === "DONE") {
          clearInterval(intervalId);
          import("./setup");
        }
      }, 1000);
    }
  });
}

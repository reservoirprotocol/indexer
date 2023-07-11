import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import "@/common/tracer";

import { RabbitMq } from "@/common/rabbit-mq";
import { acquireLock, redis, releaseLock } from "@/common/redis";
import { config } from "@/config/index";

if (process.env.LOCAL_TESTING) {
  import("./setup");
} else {
  // First assert queues / exchanges and connect to rabbit, then import setup and start the server
  RabbitMq.connect().then(async () => {
    // Sync the pods so rabbit queues assertion will run only once per deployment by a single pod
    if (await acquireLock(config.imageTag, 60)) {
      await RabbitMq.assertQueuesAndExchanges();
      await releaseLock(config.imageTag);
      import("./setup");
    } else {
      // Check every 1s if the rabbit queues assertion completed
      const intervalId = setInterval(async () => {
        if (!(await redis.get(config.imageTag))) {
          clearInterval(intervalId);
          import("./setup");
        }
      }, 1000);
    }
  });
}

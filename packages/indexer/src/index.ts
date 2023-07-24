/* eslint-disable no-console */

import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import "@/common/tracer";

import { RabbitMq } from "@/common/rabbit-mq";
import { acquireLock, redis } from "@/common/redis";
import { config } from "@/config/index";

if (process.env.LOCAL_TESTING) {
  import("./setup");
} else {
  console.log("Connecting to RabbitMQ");

  RabbitMq.connect().then(async () => {
    console.log("Connected to RabbitMQ");

    // Sync the pods so rabbit queues assertion will run only once per deployment by a single pod
    if (await acquireLock(config.imageTag, 75)) {
      console.log("acquired lock");

      await RabbitMq.assertQueuesAndExchanges();

      console.log("queues asserted");

      await redis.set(config.imageTag, "DONE", "EX", 60 * 60 * 24); // Update the lock ttl

      console.log("lock set");

      import("./setup");
    } else {
      console.log("unable to acquire lock");

      // Check every 1s if the rabbit queues assertion completed
      const intervalId = setInterval(async () => {
        console.log("interval - checking lock");

        if ((await redis.get(config.imageTag)) === "DONE") {
          console.log("clearing interval");

          clearInterval(intervalId);
          import("./setup");
        }
      }, 1000);
    }
  });
}

import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import "@/common/tracer";

import { RabbitMq } from "@/common/rabbit-mq";

if (process.env.LOCAL_TESTING) {
  import("./setup");
} else {
  // First assert queues / exchanges and connect to rabbit, then import setup and start the server
  RabbitMq.connect()
    // .then(() => RabbitMq.assertQueuesAndExchanges())
    .then(() => import("./setup"));
}

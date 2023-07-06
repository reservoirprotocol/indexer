import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { RabbitMq } from "@/common/rabbit-mq";

// First assert queues / exchanges and connect to rabbit, then import setup and start the server
RabbitMq.connect()
  .then(() => RabbitMq.assertQueuesAndExchanges())
  .then(() => import("./setup"));

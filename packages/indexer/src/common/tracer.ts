import tracer from "dd-trace";
import { Network } from "@reservoir0x/sdk/dist/utils";

import { getServiceName } from "@/config/network";
import { config } from "@/config/index";

if (process.env.DATADOG_AGENT_URL) {
  const service = getServiceName();

  tracer.init({
    profiling: true,
    logInjection: true,
    runtimeMetrics: true,
    clientIpEnabled: true,
    service,
    url: process.env.DATADOG_AGENT_URL,
    env: config.environment,
    // samplingRules: [
    //   {
    //     service: `${service}-postgres`,
    //     name: "pg.query",
    //     sampleRate: 0,
    //   },
    //   {
    //     service: `${service}`,
    //     name: "pg.query",
    //     sampleRate: 0,
    //   },
    // ],
  });

  tracer.use("hapi", {
    headers: ["x-api-key", "referer"],
  });

  tracer.use("ioredis", {
    enabled: config.chainId === Network.Ancient8Testnet,
  });

  tracer.use("amqplib", {
    enabled: config.chainId === Network.Ancient8Testnet,
  });

  tracer.use("pg", {
    enabled: config.chainId === Network.Ancient8Testnet,
  });
}

export default tracer;

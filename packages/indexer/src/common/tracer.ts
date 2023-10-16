import tracer from "dd-trace";

import { getServiceName } from "@/config/network";
import { config } from "@/config/index";
import { Network } from "@reservoir0x/sdk/dist/utils";
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
    samplingRules: [
      {
        service: `${service}-postgres`,
        sampleRate: 0,
      },
      {
        service: `${service}-redis`,
        sampleRate: 0,
      },
      {
        service: `${service}-amqp`,
        sampleRate: 0,
      },
      {
        service: `${service}-elasticsearch`,
        sampleRate: 0,
      },
    ],
  });

  tracer.use("hapi", {
    headers: ["x-api-key", "referer"],
  });

  tracer.use("ioredis", {
    enabled: config.chainId === Network.Ethereum,
  });

  tracer.use("amqplib", {
    enabled: config.chainId === Network.Ethereum,
  });

  tracer.use("pg", {
    enabled: config.chainId === Network.Ethereum,
  });

  tracer.use("elasticsearch", {
    enabled: config.chainId === Network.Ethereum,
  });
}

export default tracer;

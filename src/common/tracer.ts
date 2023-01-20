import tracer from "dd-trace";
import { getServiceName } from "@/config/network";
import { logger } from "@/common/logger";

if (process.env.DATADOG_AGENT_URL) {
  const service = getServiceName();

  tracer.init({
    profiling: true,
    logInjection: true,
    runtimeMetrics: true,
    service,
    url: process.env.DATADOG_AGENT_URL,
    logger: {
      debug: (message) => logger.error("datadog-tracer-debug", `debug: ${message}`),
      error: (err) => logger.error("datadog-tracer-debug", `error: ${err}`),
      warn: (message) => logger.error("datadog-tracer-debug", `warn: ${message}`),
      info: (message) => logger.error("datadog-tracer-debug", `info: ${message}`),
    },
  });

  tracer.use("hapi", {
    headers: ["x-api-key", "referer"],
  });
}

export default tracer;

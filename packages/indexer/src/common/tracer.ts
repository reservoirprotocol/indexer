import tracer from "dd-trace";
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
    sampleRate: config.chainId == 1 ? 1.0 : undefined,
  });

  tracer.use("hapi", {
    headers: ["x-api-key", "referer"],
  });
}

export default tracer;

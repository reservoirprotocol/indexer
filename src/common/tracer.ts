import tracer from "dd-trace";
import { getServiceName } from "@/config/network";

const service = getServiceName();

if (process.env.DATADOG_AGENT_URL) {
  tracer.init({
    profiling: true,
    logInjection: true,
    runtimeMetrics: true,
    service,
    url: process.env.DATADOG_AGENT_URL,
  });
} else {
  tracer.init({
    profiling: true,
    logInjection: true,
    runtimeMetrics: true,
    service,
  });
}

tracer.use("hapi", {
  headers: ["x-api-key", "referer"],
});

export default tracer;

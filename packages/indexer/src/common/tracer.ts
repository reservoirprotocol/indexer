import tracer from "dd-trace";
import tags from "dd-trace/ext/tags";
import { getServiceName } from "@/config/network";

if (process.env.DATADOG_AGENT_URL) {
  const service = getServiceName();

  tracer.init({
    profiling: true,
    logInjection: true,
    runtimeMetrics: true,
    clientIpEnabled: true,
    service,
    url: process.env.DATADOG_AGENT_URL,
  });

  tracer.use("hapi", {
    headers: ["x-api-key", "referer"],
  });
}

// Utility function to ensure all traces for an endpoint are ingested by Datadog
export function keepAllTraces() {
  tracer.scope().active()?.setTag(tags.MANUAL_KEEP, true);
}

export default tracer;

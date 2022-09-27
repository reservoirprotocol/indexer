import tracer from "dd-trace";

import { config } from "@/config/index";
import { getNetworkName } from "@/config/network";

if (process.env.DATADOG_AGENT_URL) {
  const isRailway = config.railwayStaticUrl !== "";
  const service = `indexer-${isRailway ? "" : "fc-"}${config.version}-${getNetworkName()}`;

  tracer.init({
    profiling: true,
    logInjection: true,
    service,
    url: process.env.DATADOG_AGENT_URL,
  });
}

export default tracer;

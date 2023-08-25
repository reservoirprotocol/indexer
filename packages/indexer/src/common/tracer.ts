// import tracer from "dd-trace";
// import { getServiceName } from "@/config/network";
// import { config } from "@/config/index";

// if (process.env.DATADOG_AGENT_URL && config.chainId !== 5) {
//   const service = getServiceName();

//   tracer.init({
//     profiling: true,
//     logInjection: true,
//     runtimeMetrics: true,
//     clientIpEnabled: true,
//     service,
//     url: process.env.DATADOG_AGENT_URL,
//     env: config.environment,
//   });

//   tracer.use("hapi", {
//     headers: ["x-api-key", "referer"],
//   });
// }
/* eslint-disable */

const tracer: any = {
  trace: () => {},
  use: () => {},
  init: () => {},
  scope: () => {},
};

export default tracer;

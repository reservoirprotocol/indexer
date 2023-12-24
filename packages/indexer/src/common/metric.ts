import tracer from "dd-trace";

const submitMetric = (type: "distribution" | "count") => {
  return ({
    name,
    value,
    tags,
  }: {
    name: string;
    value?: number;
    tags?: { [key: string]: string | number };
  }) => {
    if (process.env.DATADOG_AGENT_URL) {
      if (type === "count") {
        tracer.dogstatsd.increment(name, value ?? 1, tags);
      } else {
        tracer.dogstatsd.distribution(name, value, tags);
      }
    }
  };
};

export const metric = {
  count: submitMetric("count"),
  distribution: submitMetric("distribution"),
};

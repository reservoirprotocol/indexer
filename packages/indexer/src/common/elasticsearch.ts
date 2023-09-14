import { config } from "@/config/index";
import { Client } from "@elastic/elasticsearch";

let elasticsearch: Client;
if (config.elasticsearchUrl) {
  elasticsearch = new Client({
    node: config.elasticsearchUrl,
    requestTimeout: 10000,
  });
}

export { elasticsearch };

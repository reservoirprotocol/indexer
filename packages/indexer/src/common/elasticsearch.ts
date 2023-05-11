import { config } from "@/config/index";
import { Client } from "@elastic/elasticsearch";

let elasticsearch: Client;
let elasticsearchCloud: Client;

if (config.elasticsearchUrl) {
  elasticsearch = new Client({
    node: config.elasticsearchUrl,
  });
}

if (config.elasticsearchCloudId) {
  elasticsearchCloud = new Client({
    cloud: {
      id: config.elasticsearchCloudId,
    },
    auth: { username: config.elasticsearchUsername, password: config.elasticsearchPassword },
  });
}

export { elasticsearch, elasticsearchCloud };

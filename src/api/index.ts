import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { HapiAdapter } from "@bull-board/hapi";
import Hapi from "@hapi/hapi";
import Inert from "@hapi/inert";
import Vision from "@hapi/vision";
import HapiSwagger from "hapi-swagger";
import qs from "qs";

import { setupRoutes } from "@/api/routes";
import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { allQueues } from "@/jobs/index";

import { ApiKeyManager} from '@/entities/apikeys/api-key';

export const start = async function (): Promise<void> {
  const server = Hapi.server({
    port: config.port,
    query: {
      parser: (query) => qs.parse(query),
    },
    router: {
      stripTrailingSlash: true,
    },
    routes: {
      timeout: {
        server: 10 * 1000,
      },
      cors: {
        origin: ["*"],
      },
      // Expose any validation errors
      // https://github.com/hapijs/hapi/issues/3706
      validate: {
        failAction: (_request, _h, error) => {
          // Remove any irrelevant information from the response
          delete (error as any).output.payload.validation;
          throw error;
        },
      },
    },
  });

  // Integrated BullMQ monitoring UI
  const serverAdapter = new HapiAdapter();
  createBullBoard({
    queues: allQueues.map((q) => new BullMQAdapter(q, { readOnlyMode: true })),
    serverAdapter,
  });
  serverAdapter.setBasePath("/admin/bullmq");
  await server.register(serverAdapter.registerPlugin(), {
    routes: { prefix: "/admin/bullmq" },
  });

  const apiHost =
    config.chainId === 1
      ? "mainnet-api-v4.reservoir.tools"
      : "rinkeby-api-v4.reservoir.tools";

  await server.register([
    {
      plugin: Inert,
    },
    {
      plugin: Vision,
    },
    {
      plugin: HapiSwagger,
      options: <HapiSwagger.RegisterOptions>{
        grouping: "tags",
        security: [{ 'API_KEY': [] }],
        securityDefinitions: {
          'API_KEY': {
            type: 'apiKey',
            name: 'x-api-key',
            in: 'header',
          },
        },
        schemes: ["https", "http"],
        host: apiHost,
        cors: true,
        info: {
          title: "Reservoir Protocol API",
          version: require("../../package.json").version,
          description:
            "You are viewing the reference docs for the Reservoir API. \n\nFor a more complete overview with guides and examples, check out the <a href='https://reservoirprotocol.github.io'>Reservoir Protocol Docs</a>.",
        },
        tryItOutEnabled: true,
      },
    },
  ]);

  server.ext('onPreHandler', (request, h) => {
    ApiKeyManager.logUsage(request);
    return h.continue;
  });

  setupRoutes(server);

  await server.start();
  logger.info("process", `Started on port ${config.port}`);
};

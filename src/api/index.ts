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
import { network } from "@/common/provider";
import { config } from "@/config/index";
import { ApiKeyManager } from "@/entities/api-keys";
import { allJobQueues } from "@/jobs/index";

let server: Hapi.Server;

export const inject = (options: Hapi.ServerInjectOptions) =>
  server.inject(options);

export const start = async (): Promise<void> => {
  server = Hapi.server({
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
        additionalHeaders: ["x-api-key"],
      },
      // Expose any validation errors
      // https://github.com/hapijs/hapi/issues/3706
      validate: {
        failAction: (_request, _h, error) => {
          // Remove any irrelevant information from the response
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          delete (error as any).output.payload.validation;
          throw error;
        },
      },
    },
  });

  // Integrated BullMQ monitoring UI
  const serverAdapter = new HapiAdapter();
  createBullBoard({
    queues: allJobQueues.map((q) => new BullMQAdapter(q)),
    serverAdapter,
  });
  serverAdapter.setBasePath("/admin/bullmq");
  await server.register(serverAdapter.registerPlugin(), {
    routes: { prefix: "/admin/bullmq" },
  });

  const apiDescription = "You are viewing the reference docs for the Reservoir API.\n\
    \n\
    For a more complete overview with guides and examples, check out the <a href='https://reservoirprotocol.github.io'>Reservoir Protocol Docs</a>.";

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
        security: [{ API_KEY: [] }],
        securityDefinitions: {
          API_KEY: {
            type: "apiKey",
            name: "x-api-key",
            in: "header",
          },
        },
        schemes: ["https", "http"],
        host: `${
          network === "mainnet" ? "api" : "api-rinkeby"
        }.reservoir.tools`,
        cors: true,
        tryItOutEnabled: true,
        documentationPath: "/",
        info: {
          title: "Reservoir API",
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          version: require("../../package.json").version,
          description: apiDescription,
        },
        tags: [
          {
            name: "1. Order Book",
            description: "Read & write raw orders from Reservoir's decentralized order book"
          },
          {
            name: "2. Liquidity",
            description: "Read & write orders to Reservoir's decentralized order book"
          },
          {
            name: "3. Router",
            description: "Generate the necessary steps to buy or sell any token"
          }
        ]
      },
    },
  ]);

  server.ext("onPreHandler", (request, h) => {
    ApiKeyManager.logUsage(request);
    return h.continue;
  });

  setupRoutes(server);

  await server.start();
  logger.info("process", `Started on port ${config.port}`);
};

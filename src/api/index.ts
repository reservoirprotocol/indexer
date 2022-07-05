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
import { getNetworkName } from "@/common/utils";
import { config } from "@/config/index";
import { ApiKeyManager } from "@/models/api-keys";
import { Sources } from "@/models/sources";
import { allJobQueues } from "@/jobs/index";

let server: Hapi.Server;

export const inject = (options: Hapi.ServerInjectOptions) => server.inject(options);

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
      cache: {
        privacy: "public",
        expiresIn: 1000,
      },
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

  // Create all supported sources
  await Sources.syncSources();

  const apiDescription =
    "You are viewing the reference docs for the Reservoir API.\
    \
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
            "x-default": "demo-api-key",
          },
        },
        schemes: ["https", "http"],
        host: `${config.chainId === 1 ? "api" : `api-${getNetworkName()}`}.reservoir.tools`,
        cors: true,
        tryItOutEnabled: true,
        documentationPath: "/",
        sortEndpoints: "ordered",
        info: {
          title: "Reservoir API",
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          version: require("../../package.json").version,
          description: apiDescription,
        },
      },
    },
  ]);

  server.ext("onPreHandler", (request, h) => {
    ApiKeyManager.logUsage(request);
    return h.continue;
  });

  server.ext("onPreResponse", (request, reply) => {
    const response = request.response;

    // Set custom response in case of timeout
    if ("isBoom" in response && "output" in response) {
      if (response["output"]["statusCode"] == 503) {
        const timeoutResponse = {
          statusCode: 504,
          error: "Gateway Timeout",
          message: "Query cancelled because it took longer than 10s to execute",
        };

        return reply.response(timeoutResponse).type("application/json").code(504);
      }
    }

    return reply.continue;
  });

  setupRoutes(server);

  await server.start();
  logger.info("process", `Started on port ${config.port}`);
};

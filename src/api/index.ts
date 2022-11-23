import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { HapiAdapter } from "@bull-board/hapi";
import Basic from "@hapi/basic";
import { Boom } from "@hapi/boom";
import Hapi from "@hapi/hapi";
import Inert from "@hapi/inert";
import Vision from "@hapi/vision";
import HapiSwagger from "hapi-swagger";
import _ from "lodash";
import { RateLimiterRes } from "rate-limiter-flexible";
import qs from "qs";

import { setupRoutes } from "@/api/routes";
import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { getNetworkName } from "@/config/network";
import { allJobQueues } from "@/jobs/index";
import { ApiKeyManager } from "@/models/api-keys";
import { RateLimitRules } from "@/models/rate-limit-rules";

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
        additionalHeaders: ["x-api-key", "x-rkc-version", "x-rkui-version"],
      },
      // Expose any validation errors
      // https://github.com/hapijs/hapi/issues/3706
      validate: {
        options: {
          stripUnknown: true,
        },
        failAction: (_request, _h, error) => {
          // Remove any irrelevant information from the response
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          delete (error as any).output.payload.validation;
          throw error;
        },
      },
    },
  });

  // Register an authentication strategy for the BullMQ monitoring UI
  await server.register(Basic);
  server.auth.strategy("simple", "basic", {
    validate: (_request: Hapi.Request, username: string, password: string) => {
      return {
        isValid: username === "admin" && password === config.bullmqAdminPassword,
        credentials: { username },
      };
    },
  });

  // Setup the BullMQ monitoring UI
  const serverAdapter = new HapiAdapter();
  createBullBoard({
    queues: allJobQueues.map((q) => new BullMQAdapter(q)),
    serverAdapter,
  });
  serverAdapter.setBasePath("/admin/bullmq");
  await server.register(
    {
      plugin: serverAdapter.registerPlugin(),
      options: {
        auth: "simple",
      },
    },
    {
      routes: { prefix: "/admin/bullmq" },
    }
  );

  // Getting rate limit instance will load rate limit rules into memory
  await RateLimitRules.getInstance();

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
        host: `${`indexer-${getNetworkName()}`}.alturanft.com`,
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

  server.ext("onPreAuth", async (request, reply) => {
    const key = request.headers["x-api-key"];
    const apiKey = await ApiKeyManager.getApiKey(key);
    const tier = apiKey?.tier || 0;

    // Get the rule for the incoming request
    const rateLimitRules = await RateLimitRules.getInstance();
    const rateLimitRule = rateLimitRules.getRule(
      request.route.path,
      request.route.method,
      tier,
      apiKey?.key
    );

    // If matching rule was found
    if (rateLimitRule) {
      // If the requested path has no limit
      if (rateLimitRule.points == 0) {
        return reply.continue;
      }

      const remoteAddress = request.headers["x-forwarded-for"]
        ? _.split(request.headers["x-forwarded-for"], ",")[0]
        : request.info.remoteAddress;

      const rateLimitKey =
        _.isUndefined(key) || _.isEmpty(key) || _.isNull(apiKey) ? remoteAddress : key; // If no api key or the api key is invalid use IP

      try {
        const rateLimiterRes = await rateLimitRule.consume(rateLimitKey, 1);

        if (rateLimiterRes) {
          // Generate the rate limiting header and add them to the request object to be added to the response in the onPreResponse event
          request.headers["X-RateLimit-Limit"] = `${rateLimitRule.points}`;
          request.headers["X-RateLimit-Remaining"] = `${rateLimiterRes.remainingPoints}`;
          request.headers["X-RateLimit-Reset"] = `${new Date(
            Date.now() + rateLimiterRes.msBeforeNext
          )}`;
        }
      } catch (error) {
        if (error instanceof RateLimiterRes) {
          if (
            error.consumedPoints &&
            (error.consumedPoints == Number(rateLimitRule.points) + 1 ||
              error.consumedPoints % 50 == 0)
          ) {
            const log = {
              message: `${rateLimitKey} ${apiKey?.appName || ""} reached allowed rate limit ${
                rateLimitRule.points
              } requests in ${rateLimitRule.duration}s by calling ${
                error.consumedPoints
              } times on route ${request.route.path}${
                request.info.referrer ? ` from referrer ${request.info.referrer} ` : ""
              }`,
              route: request.route.path,
              appName: apiKey?.appName || "",
              key: rateLimitKey,
              referrer: request.info.referrer,
            };

            logger.warn("rate-limiter", JSON.stringify(log));
          }

          const tooManyRequestsResponse = {
            statusCode: 429,
            error: "Too Many Requests",
            message: `Max ${rateLimitRule.points} requests in ${rateLimitRule.duration}s reached`,
          };

          return reply
            .response(tooManyRequestsResponse)
            .type("application/json")
            .code(429)
            .takeover();
        } else {
          logger.error("rate-limiter", `Rate limit error ${error}`);
        }
      }
    }

    return reply.continue;
  });

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

    if (!(response instanceof Boom)) {
      response.header("X-RateLimit-Limit", request.headers["X-RateLimit-Limit"]);
      response.header("X-RateLimit-Remaining", request.headers["X-RateLimit-Remaining"]);
      response.header("X-RateLimit-Reset", request.headers["X-RateLimit-Reset"]);
    }

    return reply.continue;
  });

  setupRoutes(server);

  await server.start();
  logger.info("process", `Started on port ${config.port}`);
};

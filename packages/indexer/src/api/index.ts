import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { HapiAdapter } from "@bull-board/hapi";
import Basic from "@hapi/basic";
import { Boom } from "@hapi/boom";
import Hapi from "@hapi/hapi";
import Inert from "@hapi/inert";
import Vision from "@hapi/vision";
import HapiPulse from "hapi-pulse";
import HapiSwagger from "hapi-swagger";
import _ from "lodash";
import qs from "qs";
import { RateLimiterRes } from "rate-limiter-flexible";

import { setupRoutes } from "@/api/routes";
import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { getSubDomain } from "@/config/network";
import { allJobQueues } from "@/jobs/index";
import { ApiKeyManager } from "@/models/api-keys";
import { RateLimitRules } from "@/models/rate-limit-rules";
import { BlockedRouteError } from "@/models/rate-limit-rules/errors";
import { countApiUsageJob } from "@/jobs/metrics/count-api-usage-job";
import { generateOpenApiSpec } from "./endpoints/admin";

let server: Hapi.Server;

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
        additionalHeaders: [
          "x-api-key",
          "x-rkc-version",
          "x-rkui-version",
          "x-rkui-context",
          "x-syncnode-version",
        ],
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

  if (!process.env.LOCAL_TESTING) {
    // Getting rate limit instance will load rate limit rules into memory
    await RateLimitRules.getInstance(true);
  }

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
        host: `${getSubDomain()}.reservoir.tools`,
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
    {
      plugin: HapiPulse,
      options: {
        timeout: 25 * 1000,
        signals: ["SIGINT", "SIGTERM"],
        preServerStop: async () => {
          logger.info("process", "Shutting down");
        },
      },
    },
  ]);

  if (!process.env.LOCAL_TESTING) {
    server.ext("onPostAuth", async (request, reply) => {
      // Set the request URL query string
      const searchParams = new URLSearchParams(request.query);
      request.pre.queryString = searchParams.toString();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const isInjected = (request as any).isInjected;
      if (isInjected) {
        request.headers["x-api-key"] = config.adminApiKey;
      }

      if (isInjected || request.route.path === "/livez") {
        return reply.continue;
      }

      if (request.route.path.startsWith("/admin/bullmq")) {
        return reply.continue;
      }

      if (
        request.headers["x-admin-api-key"] &&
        request.headers["x-admin-api-key"] === config.adminApiKey
      ) {
        return reply.continue;
      }

      const remoteAddress = request.headers["x-forwarded-for"]
        ? _.split(request.headers["x-forwarded-for"], ",")[0]
        : request.info.remoteAddress;

      const origin = request.headers["origin"];

      const key = request.headers["x-api-key"];
      const apiKey = await ApiKeyManager.getApiKey(key, remoteAddress, origin);
      const tier = apiKey?.tier || 0;
      let rateLimitRule;

      // Get the rule for the incoming request
      const rateLimitRules = await RateLimitRules.getInstance();

      try {
        rateLimitRule = rateLimitRules.getRateLimitObject(
          request.route.path,
          request.route.method,
          tier,
          apiKey?.key,
          new Map(Object.entries(_.merge(request.payload, request.query, request.params)))
        );
      } catch (error) {
        if (error instanceof BlockedRouteError) {
          const blockedRouteResponse = {
            statusCode: 429,
            error: "Route is suspended",
            message: `Request to ${request.route.path} is currently suspended`,
          };

          return reply
            .response(blockedRouteResponse)
            .type("application/json")
            .code(429)
            .header("tier", `${tier}`)
            .takeover();
        }
      }

      // If matching rule was found
      if (rateLimitRule) {
        // If the requested path has no limit
        if (rateLimitRule.rule.points == 0) {
          return reply.continue;
        }

        const rateLimitKey = _.isEmpty(key) ? remoteAddress : key; // If no api key or the api key is invalid use IP

        try {
          if (key && tier) {
            request.pre.metrics = {
              apiKey: key,
              route: request.route.path,
              points: rateLimitRule.pointsToConsume,
              timestamp: _.now(),
            };
          }

          const rateLimiterRes = await rateLimitRule.rule.consume(
            rateLimitKey,
            rateLimitRule.pointsToConsume
          );

          if (rateLimiterRes) {
            // Generate the rate limiting header and add them to the request object to be added to the response in the onPreResponse event
            request.headers["tier"] = tier;
            request.headers["X-RateLimit-Limit"] = `${rateLimitRule.rule.points}`;
            request.headers["X-RateLimit-Remaining"] = `${rateLimiterRes.remainingPoints}`;
            request.headers["X-RateLimit-Reset"] = `${new Date(
              Date.now() + rateLimiterRes.msBeforeNext
            )}`;
          }
        } catch (error) {
          if (error instanceof RateLimiterRes) {
            if (
              error.consumedPoints &&
              (error.consumedPoints == Number(rateLimitRule.rule.points) + 1 ||
                error.consumedPoints % 50 == 0)
            ) {
              const log = {
                message: `${rateLimitKey} ${apiKey?.appName || ""} reached allowed rate limit ${
                  rateLimitRule.rule.points
                } credits in ${rateLimitRule.rule.duration}s by calling ${
                  error.consumedPoints
                } times on route ${request.route.path}${
                  request.info.referrer ? ` from referrer ${request.info.referrer} ` : ""
                } x-api-key ${key}`,
                route: request.route.path,
                appName: apiKey?.appName || "",
                key: rateLimitKey,
                referrer: request.info.referrer,
              };

              logger.warn("rate-limiter", JSON.stringify(log));
            }

            const message = rateLimitRule.ruleParams.getRateLimitMessage(
              key,
              rateLimitRule.rule.points,
              rateLimitRule.rule.duration
            );

            const tooManyRequestsResponse = {
              statusCode: 429,
              error: "Too Many Requests",
              message,
            };

            // If rate limit points are 1
            if (request.pre?.metrics) {
              request.pre.metrics.points = 1;
            }

            return reply
              .response(tooManyRequestsResponse)
              .header("tier", `${tier}`)
              .type("application/json")
              .code(429)
              .takeover();
          } else {
            logger.warn("rate-limiter", `Rate limit error ${error}`);
          }
        }
      }

      return reply.continue;
    });

    server.ext("onPreHandler", async (request, h) => {
      try {
        ApiKeyManager.logRequest(request).catch();
      } catch {
        // Ignore errors
      }

      return h.continue;
    });

    server.ext("onPreResponse", (request, reply) => {
      const response = request.response;

      // Set custom response in case of timeout
      if ("isBoom" in response && "output" in response) {
        if (response["output"]["statusCode"] >= 500) {
          ApiKeyManager.logUnexpectedErrorResponse(request, response);
        }

        if (response["output"]["statusCode"] == 503) {
          const timeoutResponse = {
            statusCode: 504,
            error: "Gateway Timeout",
            message: "Query cancelled because it took longer than 10s to execute",
          };

          return reply.response(timeoutResponse).type("application/json").code(504);
        }
      }

      const typedResponse = response as Hapi.ResponseObject;
      let statusCode = typedResponse.statusCode;

      // Indicate it's an error response
      if ("output" in response) {
        statusCode = _.toInteger(response["output"]["statusCode"]);
      }

      // Count the API usage, to prevent any latency on the request no need to wait and ignore errors
      if (request.pre.metrics && statusCode >= 100 && statusCode < 500) {
        request.pre.metrics.statusCode = statusCode;

        try {
          countApiUsageJob.addToQueue(request.pre.metrics).catch();
        } catch {
          // Ignore errors
        }
      }

      if (!(response instanceof Boom) && statusCode === 200) {
        typedResponse.header("tier", request.headers["tier"]);
        typedResponse.header("X-RateLimit-Limit", request.headers["X-RateLimit-Limit"]);
        typedResponse.header("X-RateLimit-Remaining", request.headers["X-RateLimit-Remaining"]);
        typedResponse.header("X-RateLimit-Reset", request.headers["X-RateLimit-Reset"]);

        if (request.route.settings.tags && request.route.settings.tags.includes("x-deprecated")) {
          typedResponse.header("Deprecation", "true");
        }
      }

      return reply.continue;
    });
  }

  setupRoutes(server);

  server.listener.keepAliveTimeout = 61000;
  await generateOpenApiSpec();
  await server.start();
  logger.info("process", `Started on port ${config.port}`);
};

export const inject = async (options: Hapi.ServerInjectOptions) => {
  if (server) {
    return server.inject(options);
  }

  return {
    payload: "",
    statusCode: 0,
  };
};

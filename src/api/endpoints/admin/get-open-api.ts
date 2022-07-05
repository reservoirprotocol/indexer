import { RouteOptions } from "@hapi/hapi";
import { logger } from "@/common/logger";
import { inject } from "@/api/index";
import swagger2openapi from "swagger2openapi";

//eslint-disable-next-line
function parseMethod(object: { [key: string]: any }) {
  if (object["get"]) {
    return object["get"];
  } else if (object["post"]) {
    return object["post"];
  } else if (object["put"]) {
    return object["put"];
  } else if (object["delete"]) {
    return object["delete"];
  }
  return null;
}

export const getOpenApiOptions: RouteOptions = {
  description: "Get swagger json in OpenApi V3",
  tags: ["api", "x-admin"],
  timeout: {
    server: 10 * 1000,
  },
  handler: async () => {
    try {
      const response = await inject({
        method: "GET",
        url: "/swagger.json",
      });

      const swagger = JSON.parse(response.payload);

      const data = await swagger2openapi.convertObj(swagger, {
        patch: true,
        warnOnly: true,
      });

      data.openapi["servers"] = [
        {
          url: "https://api.reservoir.tools",
        },
        {
          url: "http://api-rinkeby.reservoir.tools",
        },
      ];

      data.openapi["paths"] = Object.fromEntries(
        //eslint-disable-next-line
        Object.entries(data.openapi["paths"]).sort((a: any, b: any) => {
          const aMethod = parseMethod(a[1]);
          const bMethod = parseMethod(b[1]);
          if (aMethod["tags"][0] < bMethod["tags"][0]) {
            return -1;
          }

          if (aMethod["tags"][0] > bMethod["tags"][0]) {
            return 1;
          }
          return 0;
        })
      );

      return data.openapi;
    } catch (error) {
      logger.error("get-open-api-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};

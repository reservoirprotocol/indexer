import { RouteOptions } from "@hapi/hapi";
import swagger2openapi from "swagger2openapi";

import { inject } from "@/api/index";
import { logger } from "@/common/logger";

// eslint-disable-next-line
const parseMethod = (object: { [key: string]: any }) => {
  if (object["get"]) {
    return object["get"];
  } else if (object["post"]) {
    return object["post"];
  } else if (object["put"]) {
    return object["put"];
  } else if (object["delete"]) {
    return object["delete"];
  }
};

// eslint-disable-next-line
const getMethod = (object: { [key: string]: any }) => {
  if (object["get"]) {
    return "get";
  } else if (object["post"]) {
    return "post";
  } else if (object["put"]) {
    return "put";
  } else if (object["delete"]) {
    return "delete";
  }
};

let openapiData = {};

export const generateOpenApiSpec = async () => {
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
        url: "https://api-goerli.reservoir.tools",
      },
      {
        url: "https://api-optimism.reservoir.tools",
      },
      {
        url: "https://api-polygon.reservoir.tools",
      },
      {
        url: "https://api-mumbai.reservoir.tools",
      },
      {
        url: "https://api-bsc.reservoir.tools",
      },
      {
        url: "https://api-arbitrum.reservoir.tools",
      },
      {
        url: "https://api-arbitrum-nova.reservoir.tools",
      },
      {
        url: "https://api-sepolia.reservoir.tools",
      },
      {
        url: "https://api-base.reservoir.tools",
      },
      {
        url: "https://api-base-goerli.reservoir.tools",
      },
      {
        url: "https://api-scroll-alpha.reservoir.tools",
      },
      {
        url: "https://api-zora.reservoir.tools",
      },
      {
        url: "https://api-zora-testnet.reservoir.tools",
      },
      {
        url: "https://api-linea.reservoir.tools",
      },
      {
        url: "https://api-avalanche.reservoir.tools",
      },
      {
        url: "https://api-zksync.reservoir.tools",
      },
      {
        url: "https://api-polygon-zkevm.reservoir.tools",
      },
      {
        url: "https://api-scroll.reservoir.tools",
      },
      {
        url: "https://api-frame-testnet.reservoir.tools",
      },
      {
        url: "https://api-ancient8-testnet.reservoir.tools",
      },
      {
        url: "https://api-ancient8.reservoir.tools",
      },
      {
        url: "https://api-base-sepolia.reservoir.tools",
      },
    ];

    // Preset list of tags.
    const tagOrder = [
      "Tokens",
      "Collections",
      "Attributes",
      "Activity",
      "Orders",
      "Sales",
      "Transfers",
      "Events",
      "Owners",
      "Stats",
      "Sources",
      "Chain",
    ];

    data.openapi["paths"] = Object.fromEntries(
      // eslint-disable-next-line
      Object.entries(data.openapi["paths"]).sort((a: any, b: any) => {
        const aMethod = parseMethod(a[1]);
        const bMethod = parseMethod(b[1]);

        aMethod["tags"] = aMethod["tags"] ? aMethod["tags"] : [];
        bMethod["tags"] = bMethod["tags"] ? bMethod["tags"] : [];

        // Get the index of the tags in the preset array.
        let aTagIndex = tagOrder.indexOf(aMethod["tags"][0]);
        let bTagIndex = tagOrder.indexOf(bMethod["tags"][0]);

        // If a tag doesn't exist in the preset array, give it a high index.
        if (aTagIndex === -1) {
          aTagIndex = tagOrder.length;
        }

        if (bTagIndex === -1) {
          bTagIndex = tagOrder.length;
        }

        // Compare the indices of the tags in the preset array.
        if (aTagIndex < bTagIndex) {
          return -1;
        }

        if (aTagIndex > bTagIndex) {
          return 1;
        }

        return 0;
      })
    );

    data.openapi["paths"] = Object.fromEntries(
      // eslint-disable-next-line
      Object.entries(data.openapi["paths"]).map((path: any) => {
        const pathMethod = parseMethod(path[1]);

        if (pathMethod.parameters?.length) {
          for (const parameter of pathMethod.parameters) {
            const parameterDefault = parameter.schema?.default;

            if (parameterDefault !== undefined) {
              delete parameter.schema.default;
              const defaultDescription = `defaults to **${parameterDefault}**`;

              parameter.description = parameter.description
                ? `${parameter.description} ${defaultDescription}`
                : defaultDescription;
            }
          }

          path[1][getMethod(path[1])!] = pathMethod;
        }

        return path;
      })
    );

    openapiData = data.openapi;
  } catch (e) {
    logger.error("generation-openapi-spec", `generate openapi spec error: ${e}`);
  }
};

export const getOpenApiOptions: RouteOptions = {
  description: "Get swagger json in OpenApi V3",
  tags: ["api", "x-admin"],
  timeout: {
    server: 10 * 1000,
  },
  handler: async () => {
    try {
      if (!openapiData) {
        await generateOpenApiSpec();
      }

      return openapiData;
    } catch (error) {
      logger.error("get-open-api-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};

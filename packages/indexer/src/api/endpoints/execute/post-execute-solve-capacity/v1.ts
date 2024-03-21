import { AddressZero } from "@ethersproject/constants";
import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import axios from "axios";
import Joi from "joi";

import { logger } from "@/common/logger";
import { regex } from "@/common/utils";
import { config } from "@/config/index";

const version = "v1";

export const postExecuteSolveCapacityV1Options: RouteOptions = {
  description: "Get the capacity for indirect filling via a solver",
  tags: ["api", "Misc"],
  plugins: {
    "hapi-swagger": {
      order: 50,
    },
  },
  validate: {
    payload: Joi.alternatives(
      Joi.object({
        kind: Joi.string().valid("seaport-intent").required(),
      }),
      Joi.object({
        kind: Joi.string().valid("cross-chain-intent").required(),
        user: Joi.string().pattern(regex.address),
      })
    ),
  },
  response: {
    schema: Joi.object({
      capacityPerRequest: Joi.string().pattern(regex.number).required(),
      totalCapacity: Joi.string().pattern(regex.number).required(),
      userBalance: Joi.object({
        currentChain: Joi.string().pattern(regex.number).required(),
        allChains: Joi.string().pattern(regex.number).required(),
      }),
      // TODO: To remove, only kept for backwards-compatibility reasons
      maxItems: Joi.number().required(),
      maxPricePerItem: Joi.string().pattern(regex.number).required(),
    }).label(`postExecuteSolveCapacity${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `post-execute-solve-capacity-${version}-handler`,
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = request.payload as any;

    try {
      switch (payload.kind) {
        case "cross-chain-intent": {
          const notImplemented = () => {
            throw Boom.notImplemented("Cross-chain intent filling not supported");
          };

          if (!config.crossChainSolverBaseUrl) {
            notImplemented();
          }

          const response: {
            enabled: boolean;
            solver?: { balance: string; capacityPerRequest: string };
          } = await axios
            .get(
              `${config.crossChainSolverBaseUrl}/config?originChainId=${
                config.chainId
              }&destinationChainId=${config.chainId}&user=${
                payload.user ?? AddressZero
              }&currency=${AddressZero}`
            )
            .then((response) => response.data);

          if (!response.enabled) {
            notImplemented();
          }

          return {
            capacityPerRequest: response.solver!.capacityPerRequest,
            totalCapacity: response.solver!.balance,
            userBalance: payload.user
              ? {
                  currentChain: "0",
                  allChains: "0",
                }
              : undefined,
            // TODO: To remove, only kept for backwards-compatibility reasons
            maxItems: 1,
            maxPricePerItem: response.solver!.capacityPerRequest,
          };
        }

        case "seaport-intent": {
          const notImplemented = () => {
            throw Boom.notImplemented("Seaport intent filling not supported");
          };

          if (!config.seaportSolverBaseUrl) {
            notImplemented();
          }

          const response: {
            enabled: boolean;
            solver?: { balance: string; capacityPerRequest: string };
          } = await axios
            .get(`${config.seaportSolverBaseUrl}/config?chainId=${config.chainId}`)
            .then((response) => response.data);

          if (!response.enabled) {
            notImplemented();
          }

          return {
            capacityPerRequest: response.solver!.capacityPerRequest,
            totalCapacity: response.solver!.balance,
            // TODO: To remove, only kept for backwards-compatibility reasons
            maxItems: 1,
            maxPricePerItem: response.solver!.capacityPerRequest,
          };
        }

        default: {
          throw new Error("Unreachable");
        }
      }
    } catch (error) {
      logger.error(`post-execute-solve-capacity-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};

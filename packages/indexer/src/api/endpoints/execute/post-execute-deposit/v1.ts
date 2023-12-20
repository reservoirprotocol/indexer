import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";
import { randomUUID } from "crypto";
import Joi from "joi";

import { JoiPrice, getJoiPriceObject } from "@/common/joi";
import { logger } from "@/common/logger";
import { regex } from "@/common/utils";
import { config } from "@/config/index";
import { ApiKeyManager } from "@/models/api-keys";

const version = "v1";

export const postExecuteDepositV1Options: RouteOptions = {
  description: "Deposit funds to the solver",
  tags: ["api", "Misc"],
  plugins: {
    "hapi-swagger": {
      order: 50,
    },
  },
  validate: {
    payload: Joi.object({
      user: Joi.string().pattern(regex.address).required().description("User depositing"),
      amount: Joi.string().pattern(regex.number).required().description("Amount to deposit"),
    }),
  },
  response: {
    schema: Joi.object({
      steps: Joi.array().items(
        Joi.object({
          id: Joi.string().required(),
          action: Joi.string().required(),
          description: Joi.string().required(),
          kind: Joi.string().valid("transaction").required(),
          items: Joi.array()
            .items(
              Joi.object({
                status: Joi.string().valid("complete", "incomplete").required(),
                data: Joi.object(),
                check: Joi.object({
                  endpoint: Joi.string().required(),
                  method: Joi.string().valid("POST").required(),
                  body: Joi.any(),
                }).description("The details of the endpoint for checking the status of the step"),
              })
            )
            .required(),
        })
      ),
      fees: Joi.object({
        gas: JoiPrice,
        relayer: JoiPrice,
      }),
    }).label(`postExecuteDeposit${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`post-execute-deposit-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = request.payload as any;

    try {
      if (!config.crossChainSolverBaseUrl) {
        throw Boom.badRequest("Deposits to the current chain not supported");
      }

      const user = payload.user as string;
      const amount = payload.amount as string;

      const ccConfig: {
        enabled: boolean;
        solver?: {
          address: string;
        };
      } = await axios
        .get(
          `${config.crossChainSolverBaseUrl}/config?originChainId=${
            config.chainId
          }&destinationChainId=${config.chainId}&user=${user}&currency=${
            Sdk.Common.Addresses.Native[config.chainId]
          }`
        )
        .then((response) => response.data);

      if (!ccConfig.enabled) {
        throw Boom.badRequest("Deposits to the current chain not supported");
      }

      type StepType = {
        id: string;
        action: string;
        description: string;
        kind: string;
        items: {
          status: string;
          data?: object;
          check?: {
            endpoint: string;
            method: "POST";
            body: object;
          };
        }[];
      };

      const steps: StepType[] = [
        {
          id: "deposit",
          action: "Confirm transaction in your wallet",
          description: "Deposit funds for executing the calls",
          kind: "transaction",
          items: [],
        },
      ];

      steps[0].items.push({
        status: "incomplete",
        data: {
          from: payload.taker,
          to: ccConfig.solver!.address,
          data: "0xee",
          value: amount,
          gasLimit: 21016,
          chainId: config.chainId,
        },
        check: {
          endpoint: "/execute/status/v1",
          method: "POST",
          body: {
            kind: "transaction",
          },
        },
      });

      // // Trigger to force the solver to start listening to incoming transactions
      await axios.post(`${config.crossChainSolverBaseUrl}/intents/trigger`, {
        chainId: config.chainId,
      });

      return {
        steps,
        fees: {
          gas: await getJoiPriceObject(
            { gross: { amount: "21016" } },
            Sdk.Common.Addresses.Native[config.chainId]
          ),
        },
      };
    } catch (error) {
      const key = request.headers["x-api-key"];
      const apiKey = await ApiKeyManager.getApiKey(key);
      logger.error(
        `post-execute-deposit-${version}-handler`,
        JSON.stringify({
          request: payload,
          uuid: randomUUID(),
          httpCode: error instanceof Boom.Boom ? error.output.statusCode : 500,
          error:
            error instanceof Boom.Boom ? error.output.payload : { error: "Internal Server Error" },
          apiKey,
        })
      );

      throw error;
    }
  },
};

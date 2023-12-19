import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";
import { randomUUID } from "crypto";
import Joi from "joi";

import { JoiPrice, getJoiPriceObject } from "@/common/joi";
import { logger } from "@/common/logger";
import { bn, regex } from "@/common/utils";
import { config } from "@/config/index";
import { ApiKeyManager } from "@/models/api-keys";

const version = "v1";

export const postExecuteCallV1Options: RouteOptions = {
  description: "Make arbitrary same-chain and cross-chain calls via s voler",
  tags: ["api", "Misc"],
  plugins: {
    "hapi-swagger": {
      order: 50,
    },
  },
  validate: {
    payload: Joi.object({
      user: Joi.string().pattern(regex.address).required().description("User requesting the calls"),
      txs: Joi.array()
        .items(
          Joi.object({
            to: Joi.string().pattern(regex.address).required(),
            data: Joi.string().pattern(regex.bytes).required(),
            value: Joi.string().pattern(regex.number).required(),
          })
        )
        .min(1)
        .required()
        .description("List of transactions to execute"),
      originChainId: Joi.number()
        .required()
        .description("Origination chain id (where solver needs to get paid)"),
    }),
  },
  response: {
    schema: Joi.object({
      steps: Joi.array().items(
        Joi.object({
          id: Joi.string().required(),
          action: Joi.string().required(),
          description: Joi.string().required(),
          kind: Joi.string().valid("signature", "transaction").required(),
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
    }).label(`postExecuteCall${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`post-execute-call-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = request.payload as any;

    try {
      if (!config.crossChainSolverBaseUrl) {
        throw Boom.badRequest("Calls to the current chain not supported");
      }

      const user = payload.user as string;
      const originChainId = payload.originChainId as number;

      const ccConfig: {
        enabled: boolean;
        user?: {
          balance: string;
        };
        solver?: {
          address: string;
          capacityPerRequest: string;
        };
      } = await axios
        .get(
          `${config.crossChainSolverBaseUrl}/config?originChainId=${originChainId}&destinationChainId=${config.chainId}&user=${user}&currency=${Sdk.Common.Addresses.Native[originChainId]}`
        )
        .then((response) => response.data);

      if (!ccConfig.enabled) {
        throw Boom.badRequest("Calls between requested chains not supported");
      }

      const data = {
        request: {
          originChainId,
          destinationChainId: config.chainId,
          data: payload,
          endpoint: "/execute/call/v1",
          salt: Math.floor(Math.random() * 1000000),
        },
      };

      const { requestId, price, relayerFee, depositGasFee } = await axios
        .post(`${config.crossChainSolverBaseUrl}/intents/quote`, data)
        .then((response) => ({
          requestId: response.data.requestId,
          price: response.data.price,
          relayerFee: response.data.relayerFee,
          depositGasFee: response.data.depositGasFee,
        }))
        .catch((error) => {
          throw Boom.badRequest(
            error.response?.data ? JSON.stringify(error.response.data) : "Error getting quote"
          );
        });

      if (
        ccConfig.solver?.capacityPerRequest &&
        bn(price).add(relayerFee).gt(ccConfig.solver.capacityPerRequest)
      ) {
        throw Boom.badRequest("Insufficient capacity");
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
        {
          id: "request-signature",
          action: "Authorize request",
          description: "A free off-chain signature to create the request",
          kind: "signature",
          items: [],
        },
      ];

      const cost = bn(price).add(relayerFee);
      const needsDeposit = bn(ccConfig.user!.balance).lt(cost);
      if (needsDeposit) {
        steps[0].items.push({
          status: "incomplete",
          data: {
            from: payload.taker,
            to: ccConfig.solver!.address,
            data: requestId,
            value: bn(cost).sub(ccConfig.user!.balance).toString(),
            gasLimit: 22000,
            chainId: originChainId,
          },
          check: {
            endpoint: "/execute/status/v1",
            method: "POST",
            body: {
              kind: "cross-chain-intent",
              id: requestId,
            },
          },
        });

        // Trigger to force the solver to start listening to incoming transactions
        await axios.post(`${config.crossChainSolverBaseUrl}/intents/trigger`, {
          request: data.request,
        });
      } else {
        steps[1].items.push({
          status: "incomplete",
          data: {
            sign: {
              signatureKind: "eip191",
              message: requestId,
            },
            post: {
              endpoint: "/execute/solve/v1",
              method: "POST",
              body: {
                kind: "cross-chain-intent",
                request: data.request,
              },
            },
          },
          check: {
            endpoint: "/execute/status/v1",
            method: "POST",
            body: {
              kind: "cross-chain-intent",
              id: requestId,
            },
          },
        });
      }

      return {
        steps,
        fees: {
          gas: needsDeposit
            ? await getJoiPriceObject(
                { gross: { amount: depositGasFee } },
                Sdk.Common.Addresses.Native[config.chainId]
              )
            : undefined,
          relayer: await getJoiPriceObject(
            { gross: { amount: relayerFee } },
            Sdk.Common.Addresses.Native[originChainId],
            undefined,
            undefined,
            payload.currencyChainId
          ),
        },
      };
    } catch (error) {
      const key = request.headers["x-api-key"];
      const apiKey = await ApiKeyManager.getApiKey(key);
      logger.error(
        `post-execute-call-${version}-handler`,
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

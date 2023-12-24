/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { logger } from "@/common/logger";
import { regex } from "@/common/utils";
import { ContractSets } from "@/models/contract-sets";

const version = "v1";

export const postCreateContractsSetV1Options: RouteOptions = {
  description: "Create contracts set",
  notes: `Array of contracts to gather in a set. Adding or removing a contract will change the response. You may use this set when contractSetId is an available param. Max limit of contracts passed in an array is 500. An example is below.\n\n\`"contracts": "0x60e4d786628fea6478f785a6d7e704777c86a7c6", "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d"\`\n\n\`"contractsSetId": "74cc9bdc0824e92de13c75213015916557fcf8187e43b34a8e77175cd03d1931"`,
  tags: ["api", "Collections"],
  plugins: {
    "hapi-swagger": {
      order: 1,
    },
  },
  validate: {
    payload: Joi.object({
      contracts: Joi.array()
        .items(
          Joi.string()
            .lowercase()
            .pattern(regex.address)
            .description(
              "Array of contracts to gather in a set. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
            )
        )
        .min(1)
        .max(500)
        .required(),
    }),
  },
  response: {
    schema: Joi.object({
      contractsSetId: Joi.string(),
    }).label(`postCreateContractsSet${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `post-create-contracts-set-${version}-handler`,
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const payload = request.payload as any;

    try {
      const contractsSetId = await ContractSets.add(payload.contracts);
      return { contractsSetId };
    } catch (error) {
      logger.error(`post-create-contracts-set-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};

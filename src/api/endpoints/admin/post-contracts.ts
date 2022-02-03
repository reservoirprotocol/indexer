import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";
import Joi from "joi";

import { db, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";
import { addToEventsSyncBackfillQueue } from "@/jobs/events-sync";
import { addToFastMetadataIndexQueue } from "@/jobs/fast-metadata-index";

export const postContractsOptions: RouteOptions = {
  description: "Add new contracts for tracking.",
  tags: ["api", "x-admin"],
  timeout: {
    server: 2 * 60 * 1000,
  },
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      contracts: Joi.array().items(
        Joi.string()
          .lowercase()
          .pattern(/^0x[a-f0-9]{40}$/)
      ),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Unauthorized");
    }

    const payload = request.payload as any;

    try {
      const contracts = payload.contracts;

      // Keep track of valid contracts
      const validContracts: {
        address: string;
        kind: "erc721" | "erc1155";
        deploymentBlock: number;
      }[] = [];

      let i = 0;
      while (i < contracts.length) {
        const batchSize = 5;
        const batch = contracts.slice(i, i + batchSize);

        for (const contract of batch) {
          // Avoid adding these contracts by mistake :)
          if (
            [
              // OpenSea
              "0x495f947276749ce646f68ac8c248420045cb7b5e",
              // Rarible
              "0x60f80121c31a0d46b5279700f9df786054aa5ee5",
              // Foundation
              "0x3b3ee1931dc30c1957379fac9aba94d1c48a5405",
            ].includes(contract)
          ) {
            continue;
          }

          // Make sure to not double-process any contract
          const contractExists = await db.oneOrNone(
            `
              select 1 from "contracts" "c"
              where "c"."address" = $/address/
            `,
            {
              address: contract,
            }
          );
          if (contractExists) {
            continue;
          }

          try {
            const etherscanUrl =
              config.chainId === 1
                ? "https://api.etherscan.io/api"
                : "https://api-rinkeby.etherscan.io/api";

            const deploymentBlock = await axios
              .get(
                `${etherscanUrl}?module=account&action=txlist&startBlock=0&endblock=99999999&sort=asc&page=1&offset=1&address=${contract}&apikey=${config.etherscanApiKey}`
              )
              .then(({ data }: any) => Number(data.result[0].blockNumber));

            // Check if the contract is erc721-compliant
            const erc721 = new Sdk.Common.Helpers.Erc721(
              baseProvider,
              contract
            );
            if (await erc721.isValid()) {
              validContracts.push({
                address: contract,
                kind: "erc721",
                deploymentBlock,
              });
            }

            // Check if the contract is erc1155-compliant
            const erc1155 = new Sdk.Common.Helpers.Erc1155(
              baseProvider,
              contract
            );
            if (await erc1155.isValid()) {
              validContracts.push({
                address: contract,
                kind: "erc1155",
                deploymentBlock,
              });
            }
          } catch (error) {
            // Skip invalid contracts
            logger.error(
              "post_contracts_handler",
              `Error handling contract ${contract}: ${error}`
            );
          }
        }

        i += batchSize;

        // Wait 1 second to avoid getting rate-limited by Etherscan
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      if (validContracts.length) {
        // Store the valid contracts to the database
        const columns = new pgp.helpers.ColumnSet(["address", "kind"], {
          table: "contracts",
        });
        const values = pgp.helpers.values(validContracts, columns);
        await db.none(
          `
            insert into "contracts"
            values ${values}
            on conflict do nothing
          `
        );

        // Backfill erc721 contracts
        const validErc721Contracts = validContracts.filter(
          ({ kind }) => kind === "erc721"
        );
        if (validErc721Contracts.length) {
          await addToEventsSyncBackfillQueue(
            "erc721",
            validErc721Contracts.map(({ address }) => address),
            validErc721Contracts.reduce((prev, curr) =>
              prev.deploymentBlock < curr.deploymentBlock ? prev : curr
            ).deploymentBlock,
            await baseProvider.getBlockNumber()
          );
        }

        // Backfill erc1155 contracts
        const validErc1155Contracts = validContracts.filter(
          ({ kind }) => kind === "erc1155"
        );
        if (validErc1155Contracts.length) {
          await addToEventsSyncBackfillQueue(
            "erc1155",
            validErc1155Contracts.map(({ address }) => address),
            validErc1155Contracts.reduce((prev, curr) =>
              prev.deploymentBlock < curr.deploymentBlock ? prev : curr
            ).deploymentBlock,
            await baseProvider.getBlockNumber()
          );
        }

        // TODO: Ideally we have all the orders in the database
        // and the only thing we need to do is update the token
        // caches and possibly validate/invalidate the orders.
        if (process.env.OPENSEA_INDEXER_URL) {
          for (const { address } of validContracts) {
            try {
              await axios.post(`${process.env.OPENSEA_INDEXER_URL}/relay/v3`, {
                contract: address,
              });
            } catch (error) {
              // Skip failing requests
              logger.error(
                "post_contracts_handler",
                `Failed to sync orders for contract ${address}`
              );
            }
          }
        }

        // Trigger fast metadata indexing
        if (config.chainId === 1) {
          for (const { address } of validContracts) {
            await addToFastMetadataIndexQueue(address);
          }
        }
      }

      return { message: "Success" };
    } catch (error) {
      logger.error("post_contracts_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};

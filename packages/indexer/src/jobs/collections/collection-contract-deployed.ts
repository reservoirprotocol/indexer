import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";

import { detectTokenStandard, getContractDeployer, getContractNameAndSymbol } from "./utils";
import { logger } from "@/common/logger";
import { idb } from "@/common/db";
import { toBuffer } from "@/common/utils";

export type CollectionContractDeployed = {
  contract: string;
  deployer?: string;
  blockTimestamp?: number;
};

export class CollectionNewContractDeployedJob extends AbstractRabbitMqJobHandler {
  queueName = "collection-new-contract-deployed";
  maxRetries = 10;
  concurrency = 10;
  persistent = false;

  protected async process(payload: CollectionContractDeployed) {
    const { contract } = payload;
    let deployer = payload.deployer || null;

    if (!contract) {
      logger.error(this.queueName, `Missing contract`);
      return;
    }

    if (!deployer) {
      deployer = await getContractDeployer(contract);
    }

    // get the type of the collection, either ERC721 or ERC1155. if it's not one of those, we don't care
    // get this from the contract itself
    const collectionKind = await detectTokenStandard(contract);

    switch (collectionKind) {
      case "ERC721":
      case "ERC1155":
        break;
      case "Both":
        logger.warn(
          this.queueName,
          `Collection ${contract} is both ERC721 and ERC1155. This is not supported yet.`
        );
        return;
      default:
        return;
    }

    const { symbol, name } = await getContractNameAndSymbol(contract);

    if (!name) {
      logger.warn(this.queueName, `Collection ${contract} has no name`);
    }

    await Promise.all([
      idb.none(
        `
        INSERT INTO contracts (
            address,
            kind,
            symbol,
            name,
            deployed_at
        ) VALUES (
          $/address/,
          $/kind/,
          $/symbol/,
          $/name/,
          $/deployed_at/
        )
        ON CONFLICT (address) DO UPDATE SET
          symbol = EXCLUDED.symbol,
          name = EXCLUDED.name
      `,
        {
          address: toBuffer(contract),
          kind: collectionKind.toLowerCase(),
          symbol: symbol || null,
          name: name || null,
          deployed_at: payload.blockTimestamp ? new Date(payload.blockTimestamp * 1000) : null,
        }
      ),
      name
        ? idb.none(
            `
              INSERT INTO collections (
                id,
                name,
                contract,
                creator,
                token_id_range,
                token_set_id
              ) VALUES (
                $/id/,
                $/name/,
                $/contract/,
                $/creator/,
                '(,)'::numrange,
                $/tokenSetId/
              ) ON CONFLICT DO NOTHING
            `,
            {
              id: contract,
              name: name || null,
              contract: toBuffer(contract),
              creator: deployer ? toBuffer(deployer) : null,
              tokenSetId: `contract:${contract}`,
            }
          )
        : null,
    ]);
  }

  public async addToQueue(params: CollectionContractDeployed) {
    await this.send({ payload: params });
  }
}

export const collectionNewContractDeployedJob = new CollectionNewContractDeployedJob();

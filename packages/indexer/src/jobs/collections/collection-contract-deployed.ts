import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";

import {
  detectTokenStandard,
  getContractDeployer,
  getContractNameAndSymbol,
  getContractOwner,
} from "./utils";
import { logger } from "@/common/logger";
import { idb } from "@/common/db";
import { toBuffer } from "@/common/utils";

import * as registry from "@/utils/royalties/registry";
import * as royalties from "@/utils/royalties";
import { onchainMetadataProvider } from "@/metadata/providers/onchain-metadata-provider";
import { collectionCheckSpamJob } from "@/jobs/collections-refresh/collections-check-spam-job";

export type CollectionContractDeployed = {
  contract: string;
  deployer?: string;
  blockTimestamp?: number;
};

const BLACKLISTED_DEPLOYERS = [
  "0xaf18644083151cf57f914cccc23c42a1892c218e",
  "0x9ec1c3dcf667f2035fb4cd2eb42a1566fd54d2b7",
  "0xc0edd4902879a7e85b4bd2dfe293dbec4d838c2d",
  "0x0000000000771a79d0fc7f3b7fe270eb4498f20b",
];

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

    if (deployer && BLACKLISTED_DEPLOYERS.includes(deployer)) {
      // logger.warn(
      //   this.queueName,
      //   `Collection ${contract} was deployed by a blacklisted address ${deployer}`
      // );
      return;
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

    const rawMetadata = await onchainMetadataProvider.getContractURI(contract);
    const contractMetadata = await onchainMetadataProvider._getCollectionMetadata(contract);
    const contractOwner = await getContractOwner(contract);

    await Promise.all([
      idb.none(
        `
        INSERT INTO contracts (
            address,
            kind,
            symbol,
            name,
            deployed_at,
            metadata,
            deployer,
            owner
        ) VALUES (
          $/address/,
          $/kind/,
          $/symbol/,
          $/name/,
          $/deployed_at/,
          $/metadata:json/,
          $/deployer/,
          $/owner/
        )
        ON CONFLICT DO NOTHING
      `,
        {
          address: toBuffer(contract),
          kind: collectionKind.toLowerCase(),
          symbol: symbol || null,
          name: name || null,
          deployed_at: payload.blockTimestamp ? new Date(payload.blockTimestamp * 1000) : null,
          metadata: rawMetadata ? rawMetadata : null,
          deployer: deployer ? toBuffer(deployer) : null,
          owner: contractOwner ? toBuffer(contractOwner) : null,
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
                token_set_id,
                metadata
              ) VALUES (
                $/id/,
                $/name/,
                $/contract/,
                $/creator/,
                '(,)'::numrange,
                $/tokenSetId/,
                $/metadata:json/
              ) ON CONFLICT DO NOTHING
            `,
            {
              id: contract,
              name: name || null,
              contract: toBuffer(contract),
              creator: contractOwner
                ? toBuffer(contractOwner)
                : deployer
                ? toBuffer(deployer)
                : null,
              tokenSetId: `contract:${contract}`,
              metadata: contractMetadata?.metadata ? contractMetadata?.metadata : null,
            }
          )
        : null,
    ]);

    if (name) {
      try {
        // Refresh the on-chain royalties
        await registry.refreshRegistryRoyalties(contract);
        await royalties.refreshDefaultRoyalties(contract);
        await collectionCheckSpamJob.addToQueue({ collectionId: contract });
      } catch (error) {
        logger.error(
          this.queueName,
          `Refreshing deployed collection on chain royalties error. collectionId=${contract}, error=${error}`
        );
      }
    }
  }

  public async addToQueue(params: CollectionContractDeployed) {
    await this.send({ payload: params });
  }
}

export const collectionNewContractDeployedJob = new CollectionNewContractDeployedJob();

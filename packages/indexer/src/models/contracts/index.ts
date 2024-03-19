/* eslint-disable @typescript-eslint/no-explicit-any */

import { idb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { initOnChainData, processOnChainData } from "@/events-sync/handlers/utils";

import { collectionNewContractDeployedJob } from "@/jobs/collections/collection-contract-deployed";
import { getContractNameAndSymbol, getContractOwner } from "@/jobs/collections/utils";
import { onchainMetadataProvider } from "@/metadata/providers/onchain-metadata-provider";

export class Contracts {
  public static async updateContractMetadata(contract: string) {
    const contractExists = await idb.oneOrNone(
      `
        SELECT
          symbol,
          name
        FROM contracts
        WHERE contracts.address = $/contract/
      `,
      {
        contract: toBuffer(contract),
      }
    );

    if (!contractExists) {
      // If the collection doesn't exist, push a job to retrieve it
      await collectionNewContractDeployedJob.addToQueue({
        contract,
      });

      return;
    }

    const contractMetadata = await onchainMetadataProvider._getCollectionMetadata(contract);
    if (contractMetadata?.metadata && contractMetadata.metadata.mintConfig) {
      const onChainData = initOnChainData();
      onChainData.mints.push({
        by: "contractMetadata",
        data: {
          collection: contract,
          metadata: contractMetadata.metadata,
        },
      });

      await processOnChainData(onChainData, false);
    }

    // if symbol and name are already set, skip
    if (contractExists.symbol && contractExists.name) {
      return;
    }

    const { symbol, name } = await getContractNameAndSymbol(contract);
    const contractOwner = await getContractOwner(contract);

    await idb.none(
      `
        UPDATE contracts
        SET
          symbol = $/symbol/,
          name = $/name/,
          metadata = $/metadata:json/,
          owner = $/owner/
        WHERE contracts.address = $/contract/
      `,
      {
        contract: toBuffer(contract),
        symbol,
        name,
        metadata: contractMetadata ? contractMetadata : null,
        owner: contractOwner ? toBuffer(contractOwner) : null,
      }
    );
  }
}

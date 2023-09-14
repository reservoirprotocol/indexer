/* eslint-disable @typescript-eslint/no-explicit-any */

import { idb } from "@/common/db";
import { toBuffer } from "@/common/utils";

import { collectionNewContractDeployedJob } from "@/jobs/collections/collection-contract-deployed";
import { getContractNameAndSymbol } from "@/jobs/collections/utils";

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

    // if symbol and name are already set, skip
    if (contractExists.symbol && contractExists.name) {
      return;
    }

    const { symbol, name } = await getContractNameAndSymbol(contract);

    await idb.none(
      `
        UPDATE contracts
        SET
          symbol = $/symbol/,
          name = $/name/
        WHERE contracts.address = $/contract/
      `,
      {
        contract: toBuffer(contract),
        symbol,
        name,
      }
    );
  }
}

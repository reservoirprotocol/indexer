import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { AlchemyApi } from "@/utils/alchemy";
import _ from "lodash";
import { AlchemySpamContracts } from "@/models/alchemy-spam-contracts";
import { idb } from "@/common/db";
import { toBuffer } from "@/common/utils";

export default class CollectionRefreshSpamJob extends AbstractRabbitMqJobHandler {
  queueName = "collections-refresh-spam";
  maxRetries = 10;
  concurrency = 1;
  useSharedChannel = true;

  protected async process() {
    // Get contracts marked as spam from Alchemy
    const alchemySpamContracts = await AlchemyApi.getSpamContracts();

    // If no spam contracts stop here
    if (_.isEmpty(alchemySpamContracts)) {
      return;
    }

    // Iterate the alchemy spam contracts in chunks
    for (const alchemySpamContractsChunk of _.chunk(alchemySpamContracts, 1000)) {
      const newSpamContracts: string[] = [];

      // Check if the remote contracts cached locally
      const cachedSpamContracts = await AlchemySpamContracts.getContracts(
        alchemySpamContractsChunk
      );

      // If the contract is not stored locally update the cache and the new contracts array
      for (const [contract, value] of Object.entries(cachedSpamContracts)) {
        if (_.isNull(value)) {
          await AlchemySpamContracts.add(contract);
          newSpamContracts.push(contract);
        }
      }

      // Update the new spam collections
      if (!_.isEmpty(newSpamContracts)) {
        const query = `
          UPDATE collections
          SET is_spam = 1, updated_at = now()
          WHERE contract IN ($/newSpamContracts:list/)
        `;

        await idb.none(query, {
          newSpamContracts: newSpamContracts.map(toBuffer),
        });
      }
    }
  }

  public async addToQueue() {
    await this.send();
  }
}

export const collectionRefreshSpamJob = new CollectionRefreshSpamJob();

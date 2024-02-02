import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { Collections } from "@/models/collections";
import { idb } from "@/common/db";
import {
  ActionsLogContext,
  actionsLogJob,
  ActionsLogOrigin,
} from "@/jobs/general-tracking/actions-log-job";
import { CollectionsEntity } from "@/models/collections/collections-entity";
import { config } from "@/config/index";
import { logger } from "@/common/logger";

export type CollectionCheckSpamJobPayload = {
  collectionId: string;
  trigger: "metadata-changed" | "transfer-burst";
};

export default class CollectionCheckSpamJob extends AbstractRabbitMqJobHandler {
  queueName = "collections-check-spam";
  maxRetries = 10;
  concurrency = 1;
  useSharedChannel = true;

  public async process(payload: CollectionCheckSpamJobPayload) {
    const { collectionId, trigger } = payload;
    const collection = await Collections.getById(collectionId, true);

    if (collection) {
      // if the spam was manually set by a trusted partner, don't change it
      if (collection.isSpam === 100 || collection.isSpam === -100) {
        return;
      }

      // if the collection is verified and marked as not spam -> do nothing
      if (collection.metadata?.safelistRequestStatus === "verified" && collection.isSpam <= 0) {
        return;
      }

      // if the collection is verified and marked as spam -> unspam the collection
      if (collection.metadata?.safelistRequestStatus === "verified" && collection.isSpam > 0) {
        await this.updateSpamStatus(collection.id, -1);

        logger.info(this.queueName, `collection ${collection.id} is spam but marked as verified`);

        // Track the change
        await actionsLogJob.addToQueue([
          {
            context: ActionsLogContext.SpamCollectionUpdate,
            origin: ActionsLogOrigin.MarkedAsVerified,
            actionTakerIdentifier: this.queueName,
            collection: collection.id,
            data: {
              newSpamState: -1,
            },
          },
        ]);

        return;
      }

      // If collection marked as verified or not spam by a user or already mark as spam
      if (
        collection.metadata?.safelistRequestStatus === "verified" ||
        collection.isSpam < -1 ||
        collection.isSpam > 0
      ) {
        return;
      }

      if (trigger === "metadata-changed") {
        // Check by name and if not spam check by url
        await this.checkNameFromList(collection);
        return;

        // if (!(await this.checkName(collection))) {
        //   await this.checkUrl(collection);
        // }
      }

      if (trigger === "transfer-burst") {
        // check if there is royalty in the collection
        if (collection?.royalties?.length === 0) {
          await this.updateSpamStatus(collection.id, 1);

          logger.info(
            this.queueName,
            `collection ${collection.id} is spam by burst and no royalties`
          );

          // Track the change
          await actionsLogJob.addToQueue([
            {
              context: ActionsLogContext.SpamCollectionUpdate,
              origin: ActionsLogOrigin.TransferBurstSpamCheck,
              actionTakerIdentifier: this.queueName,
              collection: collection.id,
              data: {
                newSpamState: 1,
              },
            },
          ]);
        }
      }
    }
  }
  public async checkNameFromList(collection: CollectionsEntity) {
    const newSpamState = 1;

    for (const spamName of config.spamNames) {
      if (collection.name.match(new RegExp("\\b" + spamName + "\\b", "gi"))) {
        // The name includes a spam word Collection is spam update track and return
        await this.updateSpamStatus(collection.id, newSpamState);

        logger.info(
          this.queueName,
          `collection ${collection.id} newSpamState ${newSpamState} ${JSON.stringify({
            newSpamState,
            criteria: spamName,
            collectionName: collection.name,
          })}`
        );

        // Track the change
        await actionsLogJob.addToQueue([
          {
            context: ActionsLogContext.SpamCollectionUpdate,
            origin: ActionsLogOrigin.NameSpamCheck,
            actionTakerIdentifier: this.queueName,
            collection: collection.id,
            data: {
              newSpamState,
              criteria: spamName,
              collectionName: collection.name,
            },
          },
        ]);

        return true;
      }
    }

    return false;
  }

  public async checkName(collection: CollectionsEntity) {
    const newSpamState = 1;

    // Check for spam by name
    const nameQuery = `
        SELECT *
        FROM spam_name_criteria
        WHERE name ILIKE '%${collection.name}%'
        LIMIT 1
      `;

    const nameQueryResult = await idb.oneOrNone(nameQuery);

    if (nameQueryResult) {
      // Collection is spam update track and return
      await this.updateSpamStatus(collection.id, newSpamState);

      // Track the change
      await actionsLogJob.addToQueue([
        {
          context: ActionsLogContext.SpamCollectionUpdate,
          origin: ActionsLogOrigin.NameSpamCheck,
          actionTakerIdentifier: this.queueName,
          collection: collection.id,
          data: {
            newSpamState,
            criteria: nameQueryResult.name,
            collectionName: collection.name,
          },
        },
      ]);

      return true;
    }

    return false;
  }

  // public async checkUrl(collection: CollectionsEntity) {
  //   const newSpamState = 1;
  //
  //   // Check for spam by domain
  //   if (collection.metadata.externalUrl) {
  //     const domainQuery = `
  //         SELECT *
  //         FROM spam_domain_criteria
  //         WHERE domain = $/domain/
  //         LIMIT 1
  //       `;
  //
  //     const url = new URL(collection.metadata.externalUrl);
  //     const domainQueryResult = await idb.oneOrNone(domainQuery, {
  //       domain: url.hostname,
  //     });
  //
  //     if (domainQueryResult) {
  //       // Collection is spam update track and return
  //       await this.updateSpamStatus(collection.id, newSpamState);
  //
  //       // Track the change
  //       await actionsLogJob.addToQueue([
  //         {
  //           context: ActionsLogContext.SpamCollectionUpdate,
  //           origin: ActionsLogOrigin.UrlSpamCheck,
  //           actionTakerIdentifier: this.queueName,
  //           collection: collection.id,
  //           data: {
  //             newSpamState,
  //             criteria: domainQueryResult.domain,
  //             externalUrl: collection.metadata.externalUrl,
  //             domain: url.hostname,
  //           },
  //         },
  //       ]);
  //
  //       return true;
  //     }
  //
  //     return false;
  //   }
  // }

  public async updateSpamStatus(collectionId: string, newSpamStatus: number) {
    return idb.none(
      `
      UPDATE collections
      SET is_spam = $/newSpamStatus/, updated_at = now()
      WHERE id = $/collectionId/
      AND (is_spam IS NULL OR is_spam = ${newSpamStatus > 0 ? "0" : "1"})
    `,
      {
        collectionId,
        newSpamStatus,
      }
    );
  }

  public async addToQueue(params: CollectionCheckSpamJobPayload) {
    await this.send({ payload: params, jobId: params.collectionId });
  }
}

export const collectionCheckSpamJob = new CollectionCheckSpamJob();

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { config } from "@/config/index";
import * as AsksIndex from "@/elasticsearch/indexes/asks";
import _ from "lodash";
import crypto from "crypto";
import { RabbitMQMessage } from "@/common/rabbit-mq";
import { Collections } from "@/models/collections";

export type RefreshAsksCollectionJobPayload = {
  collectionId: string;
};

export default class RefreshAsksCollectionJob extends AbstractRabbitMqJobHandler {
  queueName = "refresh-asks-collection-queue";
  maxRetries = 10;
  concurrency = 2;
  persistent = true;
  lazyMode = true;

  protected async process(payload: RefreshAsksCollectionJobPayload) {
    return;

    let addToQueue = false;

    const { collectionId } = payload;

    const collectionData = await Collections.getById(collectionId);

    if (!_.isEmpty(collectionData)) {
      const keepGoing = await AsksIndex.updateAsksCollectionData(collectionId, collectionData);

      if (keepGoing) {
        addToQueue = true;
      }
    }

    return { addToQueue };
  }

  public async onCompleted(message: RabbitMQMessage, processResult: { addToQueue: boolean }) {
    if (processResult.addToQueue) {
      await this.addToQueue(message.payload.collectionId);
    }
  }

  public async addToQueue(collectionId: string) {
    if (!config.doElasticsearchWork) {
      return;
    }

    const jobId = crypto.createHash("sha256").update(`${collectionId}`).digest("hex");

    await this.send({ payload: { collectionId }, jobId });
  }
}

export const refreshAsksCollectionJob = new RefreshAsksCollectionJob();

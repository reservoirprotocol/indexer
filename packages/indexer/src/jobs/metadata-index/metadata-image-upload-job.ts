import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import fetch from "node-fetch";
import { Buffer } from "buffer";
import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { Tokens } from "@/models/tokens";

export type MetadataImageUploadJobPayload = {
  tokenId: string;
  contract: string;
  imageURI: string;
};

export default class MetadataImageUploadJob extends AbstractRabbitMqJobHandler {
  queueName = "metadata-image-upload-job";
  maxRetries = 3;
  concurrency = 3;
  timeout = 5 * 60 * 1000;
  backoff = {
    type: "exponential",
    delay: 20000,
  } as BackoffStrategy;

  protected async process(payload: MetadataImageUploadJobPayload) {
    const { imageURI, contract, tokenId } = payload;

    try {
      let imageBuffer;

      if (this.isDataURI(imageURI)) {
        // Handle data URI
        imageBuffer = this.dataURIToBuffer(imageURI);
      } else {
        // Handle standard image URL
        imageBuffer = await this.fetchImageBuffer(imageURI);
      }

      // Upload to Cloudflare
      const uploadResult = await this.uploadToCloudflare(imageBuffer);
      if (!uploadResult.success) {
        throw new Error(`Failed to upload to Cloudflare: ${uploadResult.errors}`);
      }

      const originalImage = uploadResult.result.variants[2];

      await Tokens.update(contract, tokenId, {
        image: originalImage,
      });
    } catch (error) {
      logger.error(this.queueName, `Error. imageURI=${imageURI}, error=${error}`);
      throw error; // Rethrow the error to handle retry logic
    }
  }

  private isDataURI(uri: string) {
    return uri.startsWith("data:");
  }

  private dataURIToBuffer(dataURI: string) {
    const base64 = dataURI.split(",")[1];
    const buffer = Buffer.from(base64, "base64");
    return buffer;
  }

  private async fetchImageBuffer(url: string) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image from URL: ${url}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  private async uploadToCloudflare(imageBuffer: Buffer) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${config.cloudflareAccountID}/images/v1`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.cloudflareAPIKey}`,
        "Content-Type": "application/octet-stream",
      },
      body: imageBuffer,
    });

    if (!response.ok) {
      throw new Error(`Cloudflare API responded with ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  public async addToQueue(params: MetadataImageUploadJobPayload, delay = 0) {
    await this.send({ payload: params }, delay);
  }

  public async addToQueueBulk(params: MetadataImageUploadJobPayload[]) {
    await this.sendBatch(
      params.map((param) => {
        return { payload: param };
      })
    );
  }
}

export const metadataImageUploadJob = new MetadataImageUploadJob();

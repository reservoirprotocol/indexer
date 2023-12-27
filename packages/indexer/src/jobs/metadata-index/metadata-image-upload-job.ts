import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import fetch from "node-fetch";
import { Buffer } from "buffer";
import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { Tokens } from "@/models/tokens";
import { Collections } from "@/models/collections";
import sharp from "sharp";

export type MetadataImageUploadKind =
  | "token-image"
  | "token-media"
  | "token-uri"
  | "collection-image"
  | "collection-banner";

export type MetadataImageUploadJobPayload = {
  tokenId: string;
  contract: string;
  imageURI: string;
  mimeType: string | null;
  kind: MetadataImageUploadKind;
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
        switch (payload.mimeType) {
          case "image/gif":
            imageBuffer = await this.fetchImageBuffer(imageURI);
            // resize gif to have a max total of 50 megapixels (sum of all frames)
            // this is to prevent OOM errors when processing large gifs
            imageBuffer = await this.resizeGif(imageBuffer, 50 * 1000000);
            break;
          default:
            throw new Error(`Unsupported image MIME type: ${payload.mimeType}`);
        }
      }

      // Upload to Cloudflare
      const uploadResult = await this.uploadToCloudflare(imageBuffer);
      if (!uploadResult.success) {
        throw new Error(`Failed to upload to Cloudflare: ${uploadResult.errors}`);
      }

      const originalUrl = uploadResult.result.variants[2];

      switch (payload.kind) {
        case "token-image":
          await Tokens.update(contract, tokenId, {
            image: originalUrl,
          });
          break;
        case "token-media":
          await Tokens.update(contract, tokenId, {
            media: originalUrl,
          });
          break;
        case "token-uri":
          await Tokens.update(contract, tokenId, {
            token_uri: originalUrl,
          });
          break;
        case "collection-image":
          await Collections.updateCollectionMetadata(contract, {
            imageUrl: originalUrl,
          });
          break;
        case "collection-banner":
          await Collections.updateCollectionMetadata(contract, {
            bannerImageUrl: originalUrl,
          });
          break;
      }
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

  private async resizeGif(imageBuffer: Buffer, maxTotalPixels: number) {
    const gif = await sharp(imageBuffer, { animated: true }).toBuffer();
    const { width, height, pages } = await sharp(gif).metadata();

    if (!width || !height || !pages) {
      throw new Error(`Failed to get metadata for image`);
    }

    const totalPixels = width * height * pages;
    if (totalPixels <= maxTotalPixels) {
      return imageBuffer;
    }

    const newWidth = Math.floor(Math.sqrt((maxTotalPixels * width) / height));
    const newHeight = Math.floor(Math.sqrt((maxTotalPixels * height) / width));

    const resizedGif = await sharp(gif)
      .resize(newWidth, newHeight, {
        fit: "inside",
      })
      .toBuffer();

    return resizedGif;
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

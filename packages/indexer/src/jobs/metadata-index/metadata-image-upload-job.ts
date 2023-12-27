import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import fetch from "node-fetch";
import { Buffer } from "buffer";
import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { Tokens } from "@/models/tokens";
import { Collections } from "@/models/collections";
import sharp from "sharp";

import crypto from "crypto";
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

const MAX_GIF_SIZE = 50 * 1000000; // 50 megapixels

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
      let imageBuffer, uploadUrl;

      if (this.isDataURI(imageURI)) {
        // Handle data URI
        imageBuffer = this.dataURIToBuffer(imageURI);
      } else {
        switch (payload.mimeType) {
          case "image/gif":
            imageBuffer = await this.fetchImageBuffer(imageURI);
            // resize gif to have a max total of 50 megapixels (sum of all frames)
            // this is to prevent OOM errors when processing large gifs
            if (await this.isGifAboveMaxSize(imageBuffer)) {
              imageBuffer = await this.resizeGif(imageBuffer);
            } else {
              // Skip upload to Cloudflare if image is small enough
              uploadUrl = imageURI;
            }
            break;
          default:
            throw new Error(`Unsupported image MIME type: ${payload.mimeType}`);
        }
      }

      // Upload to Cloudflare if uploadUrl is not set
      if (!uploadUrl) {
        const uploadResult = await this.uploadToCloudflare(imageBuffer);
        if (!uploadResult.success) {
          throw new Error(`Failed to upload to Cloudflare: ${uploadResult.errors}`);
        }

        uploadUrl = uploadResult.result.variants[2];
      }

      switch (payload.kind) {
        case "token-image":
          await Tokens.update(contract, tokenId, {
            image: uploadUrl,
          });
          break;
        case "token-media":
          await Tokens.update(contract, tokenId, {
            media: uploadUrl,
          });
          break;
        case "token-uri":
          await Tokens.update(contract, tokenId, {
            token_uri: uploadUrl,
          });
          break;
        case "collection-image":
          await Collections.updateCollectionMetadata(contract, {
            imageUrl: uploadUrl,
          });
          break;
        case "collection-banner":
          await Collections.updateCollectionMetadata(contract, {
            bannerImageUrl: uploadUrl,
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

  private async isGifAboveMaxSize(imageBuffer: Buffer) {
    const gif = await sharp(imageBuffer, { animated: true }).toBuffer();
    const { width, height, pages } = await sharp(gif).metadata();

    if (!width || !height || !pages) {
      throw new Error(`Failed to get metadata for image`);
    }

    const totalPixels = width * height * pages;
    return totalPixels > MAX_GIF_SIZE;
  }

  private async resizeGif(imageBuffer: Buffer) {
    const gif = await sharp(imageBuffer, { animated: true }).toBuffer();
    const { width, height, pages } = await sharp(gif).metadata();

    if (!width || !height || !pages) {
      throw new Error(`Failed to get metadata for image`);
    }

    const totalPixels = width * height * pages;
    if (totalPixels <= MAX_GIF_SIZE) {
      return imageBuffer;
    }

    const newWidth = Math.floor(Math.sqrt((MAX_GIF_SIZE * width) / height));
    const newHeight = Math.floor(Math.sqrt((MAX_GIF_SIZE * height) / width));

    const resizedGif = await sharp(gif)
      .resize(newWidth, newHeight, {
        fit: "inside",
      })
      .toBuffer();

    return resizedGif;
  }

  private async uploadToCloudflare(imageBuffer: Buffer) {
    // take a hash of the image to use as the filename, so we can check if the image already exists
    const hash = crypto.createHash("sha256").update(imageBuffer).digest("hex");

    if (await this.checkIfImageExistsInCloudflare(hash)) {
      return {
        success: true,
        result: { variants: [`https://${config.cloudflareDomain}/${hash}`] },
      };
    }

    const url = `https://api.cloudflare.com/client/v4/accounts/${config.cloudflareAccountID}/images/v1`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.cloudflareAPIKey}`,
        "Content-Type": "application/octet-stream",
      },
      body: JSON.stringify({
        file: imageBuffer.toString("base64"),
        id: hash,
      }),
    });

    if (!response.ok) {
      throw new Error(`Cloudflare API responded with ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  private async checkIfImageExistsInCloudflare(hash: string) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${config.cloudflareAccountID}/images/v1/${hash}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.cloudflareAPIKey}`,
      },
    });

    if (!response.ok) {
      return false;
    }

    return true;
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

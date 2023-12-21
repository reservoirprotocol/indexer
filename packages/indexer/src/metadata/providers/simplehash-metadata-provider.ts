/* eslint-disable @typescript-eslint/no-explicit-any */

import { config } from "@/config/index";
import { CollectionMetadata, TokenMetadata } from "../types";
import { logger } from "@/common/logger";
import { Contract } from "ethers";
import { Interface } from "ethers/lib/utils";
import axios from "axios";
import { RequestWasThrottledError, normalizeMetadata } from "./utils";
import _ from "lodash";
import { getNetworkName } from "@/config/network";
import { baseProvider } from "@/common/provider";
import slugify from "slugify";
import { AbstractBaseMetadataProvider } from "./abstract-base-metadata-provider";

export class SimplehashMetadataProvider extends AbstractBaseMetadataProvider {
  method = "simplehash";
  async _getCollectionMetadata(contract: string, tokenId: string): Promise<CollectionMetadata> {
    const network = this.getSimplehashNetworkName();
    const url = `https://api.simplehash.com/api/v0/nfts/${network}/${contract}/${tokenId}`;

    try {
      const data = await axios
        .get(url, {
          headers: { "X-API-KEY": config.simplehashApiKey.trim() },
        })
        .then((response) => response.data);

      return this.parseCollection(data, contract);
    } catch (error) {
      logger.error(
        "simplehash-fetcher",
        `fetchCollection error. url:${url}  contract:${contract}, error:${error}`
      );

      const name = await new Contract(
        contract,
        new Interface(["function name() view returns (string)"]),
        baseProvider
      ).name();

      return {
        id: contract,
        slug: null,
        name: name,
        community: null,
        metadata: null,
        contract,
        tokenIdRange: null,
        tokenSetId: `contract:${contract}`,
        isFallback: true,
      };
    }
  }

  async _getTokensMetadata(
    tokens: { contract: string; tokenId: string }[]
  ): Promise<TokenMetadata[]> {
    const network = this.getSimplehashNetworkName();
    const searchParams = new URLSearchParams();

    const nftIds = tokens.map(({ contract, tokenId }) => `${network}.${contract}.${tokenId}`);

    searchParams.append("nft_ids", nftIds.join(","));

    const url = `https://api.simplehash.com/api/v0/nfts/assets?${searchParams.toString()}`;
    const data = await axios
      .get(url, {
        headers: { "X-API-KEY": config.simplehashApiKey.trim() },
      })
      .then((response) => response.data)
      .catch((error) => this.handleError(error));

    return data.nfts.map((nft: any) => this.parseToken(nft)).filter(Boolean);
  }

  handleError(error: any) {
    if (error.response?.status === 429 || error.response?.status === 503) {
      let delay = 1;

      if (error.response.data.detail?.startsWith("Request was throttled. Expected available in")) {
        try {
          delay = error.response.data.detail.split(" ")[6];
        } catch {
          // Skip on any errors
        }
      }

      throw new RequestWasThrottledError(error.response.statusText, delay);
    }

    throw error;
  }

  _parseToken(metadata: any): TokenMetadata {
    const {
      image_original_url,
      animation_original_url,
      metadata_original_url,
      attributes,
      media,
      ...original_metadata
    } = metadata.extra_metadata;

    let imageUrl = metadata.image_url;
    if (
      metadata.extra_metadata.image_details.format === "GIF" &&
      metadata.extra_metadata.image_details.bytes > 125000
    ) {
      imageUrl = metadata.previews.image_medium_url;
      logger.info(
        this.method,
        `Detected GIF over 1MB. contract=${metadata.contract_address}, tokenId=${metadata.token_id}, imageUrl=${imageUrl}`
      );
    }

    return {
      contract: _.toLower(metadata.contract_address),
      tokenId: metadata.token_id,
      name: metadata.name,
      collection: _.toLower(metadata.contract_address),
      flagged: null,
      slug:
        metadata.collection.marketplace_pages?.filter(
          (market: any) => market.marketplace_id === "opensea"
        )[0]?.marketplace_collection_id ?? undefined,
      // Token descriptions are a waste of space for most collections we deal with
      // so by default we ignore them (this behaviour can be overridden if needed).
      description: metadata.description,
      originalMetadata: original_metadata,
      imageUrl: imageUrl,
      imageOriginalUrl: image_original_url,
      animationOriginalUrl: animation_original_url,
      metadataOriginalUrl: metadata_original_url,
      imageProperties: metadata.image_properties,
      mediaUrl: metadata.video_url ?? metadata.audio_url ?? media,
      attributes: (attributes || []).map((trait: any) => ({
        key: trait.trait_type ?? "property",
        value: trait.value,
        kind: typeof trait.value == "number" ? "number" : "string",
        rank: 1,
      })),
    };
  }

  protected parseCollection(metadata: any, contract: string): CollectionMetadata {
    let slug = null;
    if (_.isArray(metadata.collection.marketplace_pages)) {
      for (const market of metadata.collection.marketplace_pages) {
        if (market.marketplace_id === "opensea") {
          slug = slugify(market.marketplace_collection_id, { lower: true });
        }
      }
    }

    return {
      id: contract,
      slug,
      name: metadata.collection.name,
      community: null,
      metadata: normalizeMetadata(metadata.collection),
      contract,
      tokenIdRange: null,
      tokenSetId: `contract:${contract}`,
      creator: _.toLower(metadata.contract.deployed_by),
    };
  }

  getSimplehashNetworkName(): string {
    const network = getNetworkName();
    if (!network) {
      throw new Error("Unsupported chain id");
    }

    if (network == "mainnet") {
      return "ethereum";
    }

    if (network == "zksync") {
      return "zksync-era";
    }

    if (network == "goerli") {
      return "ethereum-goerli";
    }

    if (network == "mumbai") {
      return "polygon-mumbai";
    }

    if (network == "sepolia") {
      return "ethereum-sepolia";
    }

    return network;
  }
}

export const simplehashMetadataProvider = new SimplehashMetadataProvider();

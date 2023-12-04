/* eslint-disable @typescript-eslint/no-explicit-any */

import { config } from "@/config/index";
import { CollectionMetadata, TokenMetadata } from "../types";
import { logger } from "@/common/logger";
import { Contract } from "ethers";
import { Interface } from "ethers/lib/utils";
import { baseProvider } from "@/common/provider";
import axios from "axios";
import { CollectionNotFoundError, RequestWasThrottledError, normalizeMetadata } from "./utils";
import _ from "lodash";
import { AbstractBaseMetadataProvider } from "./abstract-base-metadata-provider";
import { customHandleToken, hasCustomHandler } from "../custom";
import { extendMetadata, hasExtendHandler } from "../extend";
import { getOpenseaNetworkName } from "@/config/network";

class OpenseaMetadataProvider extends AbstractBaseMetadataProvider {
  method = "opensea";
  protected async _getCollectionMetadata(
    contract: string,
    tokenId: string
  ): Promise<CollectionMetadata> {
    try {
      if (config.chainId === 1) {
        const { data, creatorAddress } = await this.getDataWithCreator(contract, tokenId);

        if (!data?.collection) {
          throw new Error("Missing collection");
        }

        return this.parseCollection(data, contract, creatorAddress);
      }

      const { data, creatorAddress } = await this.getDataWithCreatorV2(contract, tokenId);

      if (!data) {
        throw new Error("Missing collection");
      }

      return this.parseCollectionV2(data, contract, creatorAddress);
    } catch (error) {
      logger.error(
        "opensea-fetcher",
        JSON.stringify({
          topic: "fetchCollectionError",
          message: `Could not fetch collection.  contract=${contract}, tokenId=${tokenId}, error=${error}`,
          contract,
          tokenId,
          error,
        })
      );

      let name = contract;
      try {
        name = await new Contract(
          contract,
          new Interface(["function name() view returns (string)"]),
          baseProvider
        ).name();
      } catch (error) {
        logger.error(
          "opensea-fetcher",
          JSON.stringify({
            topic: "fetchContractNameError",
            message: `Could not fetch collection.  contract=${contract}, tokenId=${tokenId}, error=${error}`,

            contract,
            tokenId,
            error,
          })
        );
      }

      return {
        id: contract,
        slug: null,
        name,
        community: null,
        metadata: null,
        contract,
        tokenIdRange: null,
        tokenSetId: `contract:${contract}`,
        isFallback: true,
      };
    }
  }

  protected async _getTokensMetadata(
    tokens: { contract: string; tokenId: string }[]
  ): Promise<TokenMetadata[]> {
    const searchParams = new URLSearchParams();
    for (const { contract, tokenId } of tokens) {
      searchParams.append("asset_contract_addresses", contract);
      searchParams.append("token_ids", tokenId);
    }

    const url = `${
      !this.isOSTestnet() ? "https://api.opensea.io" : "https://testnets-api.opensea.io"
    }/api/v1/assets?${searchParams.toString()}`;

    const data = await axios
      .get(!this.isOSTestnet() ? config.openSeaApiUrl || url : url, {
        headers: !this.isOSTestnet()
          ? {
              url,
              "X-API-KEY": config.openSeaTokenMetadataApiKey.trim(),
              Accept: "application/json",
            }
          : {
              Accept: "application/json",
            },
      })
      .then((response) => response.data)
      .catch((error) => {
        logger.error(
          "opensea-fetcher",
          `fetchTokens error. url:${url}, message:${error.message},  status:${
            error.response?.status
          }, data:${JSON.stringify(error.response?.data)}, url:${JSON.stringify(
            error.config?.url
          )}, headers:${JSON.stringify(error.config?.headers?.url)}`
        );

        this.handleError(error);
      });

    return data.assets.map(this.parseToken).filter(Boolean);
  }

  async _getTokenFlagStatus(
    contract: string,
    tokenId: string
  ): Promise<{
    data: { contract: string; tokenId: string; isFlagged: boolean };
  }> {
    const domain = !this.isOSTestnet()
      ? "https://api.opensea.io"
      : "https://testnets-api.opensea.io";
    const url = `${domain}/api/v2/chain/${getOpenseaNetworkName()}/contract/${contract}/nfts/${tokenId}`;

    const data = await axios
      .get(!this.isOSTestnet() ? config.openSeaApiUrl || url : url, {
        headers: !this.isOSTestnet()
          ? {
              url,
              "X-API-KEY": config.openSeaTokenFlagStatusApiKey.trim(),
              Accept: "application/json",
            }
          : {
              Accept: "application/json",
            },
      })
      .then((response) => response.data)
      .catch((error) => {
        logger.error(
          "opensea-fetcher",
          JSON.stringify({
            message: `_getTokenFlagStatus error. contract:${contract}, tokenId:${tokenId}, error:${error}`,
            url,
            error,
          })
        );

        this.handleError(error);
      });

    return {
      data: {
        contract: data.nft.contract,
        tokenId: data.nft.identifier,
        isFlagged: data.nft.is_disabled,
      },
    };
  }

  async _getTokensFlagStatusByCollectionPaginationViaSlug(
    slug: string,
    continuation?: string
  ): Promise<{
    data: { contract: string; tokenId: string; isFlagged: boolean }[];
    continuation: string | null;
  }> {
    const searchParams = new URLSearchParams();

    if (continuation) searchParams.append("next", continuation);
    searchParams.append("limit", "50");

    const domain = !this.isOSTestnet()
      ? "https://api.opensea.io"
      : "https://testnets-api.opensea.io";
    const url = `${domain}/api/v2/collection/${slug}/nfts?${searchParams.toString()}`;

    const data = await axios
      .get(!this.isOSTestnet() ? config.openSeaApiUrl || url : url, {
        headers: !this.isOSTestnet()
          ? {
              url,
              "X-API-KEY": config.openSeaTokenFlagStatusApiKey.trim(),
              Accept: "application/json",
            }
          : {
              Accept: "application/json",
            },
      })
      .then((response) => response.data)
      .catch((error) => {
        logger.error(
          "opensea-fetcher",
          JSON.stringify({
            message: `_getTokensFlagStatusByCollectionPaginationViaSlug error. slug:${slug}, continuation:${continuation}, error:${error}`,
            url,
            error,
          })
        );

        this.handleError(error);
      });

    return {
      data: data.nfts.map((asset: any) => ({
        contract: asset.contract,
        tokenId: asset.identifier,
        isFlagged: asset.is_disabled,
      })),
      continuation: data.next ?? undefined,
    };
  }

  async _getTokensFlagStatusByCollectionPaginationViaContract(
    contract: string,
    continuation?: string
  ): Promise<{
    data: { contract: string; tokenId: string; isFlagged: boolean }[];
    continuation: string | null;
  }> {
    const searchParams = new URLSearchParams();

    if (continuation) searchParams.append("next", continuation);
    searchParams.append("limit", "50");

    const domain = !this.isOSTestnet()
      ? "https://api.opensea.io"
      : "https://testnets-api.opensea.io";
    const url = `${domain}/api/v2/chain/${getOpenseaNetworkName()}/contract/${contract}/nfts?${searchParams.toString()}`;

    const data = await axios
      .get(!this.isOSTestnet() ? config.openSeaApiUrl || url : url, {
        headers: !this.isOSTestnet()
          ? {
              url,
              "X-API-KEY": config.openSeaTokenFlagStatusApiKey.trim(),
              Accept: "application/json",
            }
          : {
              Accept: "application/json",
            },
      })
      .then((response) => response.data)
      .catch((error) => {
        logger.error(
          "opensea-fetcher",
          JSON.stringify({
            message: `_getTokensFlagStatusByCollectionPaginationViaContract error. contract:${contract}, continuation:${continuation}, error:${error}`,
            url,
            error,
          })
        );

        this.handleError(error);
      });

    return {
      data: data.nfts.map((asset: any) => ({
        contract: asset.contract,
        tokenId: asset.identifier,
        isFlagged: asset.is_disabled,
      })),
      continuation: data.next ?? undefined,
    };
  }

  handleError(error: any) {
    if (error.response?.status === 400) {
      if (error.response.data.errors?.includes("not found")) {
        throw new CollectionNotFoundError(error.response.data.errors);
      }
    } else if (error.response?.status === 429 || error.response?.status === 503) {
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

  parseToken(metadata: any): TokenMetadata {
    return {
      contract: metadata.asset_contract.address,
      tokenId: metadata.token_id,
      collection: _.toLower(metadata.asset_contract.address),
      slug: metadata.collection.slug,
      name: metadata.name,
      flagged: metadata.supports_wyvern != null ? !metadata.supports_wyvern : false,
      // Token descriptions are a waste of space for most collections we deal with
      // so by default we ignore them (this behaviour can be overridden if needed).
      description: metadata.description,
      imageUrl: metadata.image_url,
      imageOriginalUrl: metadata.image_original_url,
      animationOriginalUrl: metadata.animation_original_url,
      metadataOriginalUrl: metadata.token_metadata,
      mediaUrl: metadata.animation_url,
      attributes: (metadata.traits || []).map((trait: any) => ({
        key: trait.trait_type ?? "property",
        value: trait.value,
        kind: typeof trait.value == "number" ? "number" : "string",
        rank: 1,
      })),
    };
  }

  parseCollection(metadata: any, contract: string, creator: string): CollectionMetadata {
    // TODO: Do we really need these here?
    const communities = {
      "0xff9c1b15b16263c61d017ee9f65c50e4ae0113d7": "loot",
      "0x8db687aceb92c66f013e1d614137238cc698fedb": "loot",
      "0x1dfe7ca09e99d10835bf73044a23b73fc20623df": "loot",
      "0x521f9c7505005cfa19a8e5786a9c3c9c9f5e6f42": "forgottenrunes",
      "0xf55b615b479482440135ebf1b907fd4c37ed9420": "forgottenrunes",
      "0x31158181b4b91a423bfdc758fc3bf8735711f9c5": "forgottenrunes",
      "0x251b5f14a825c537ff788604ea1b58e49b70726f": "forgottenrunes",
      "0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85": "ens",
    };

    // Collect the fees
    const royalties = [];
    const fees = [];

    for (const key in metadata.collection.fees.seller_fees) {
      if (Object.prototype.hasOwnProperty.call(metadata.collection.fees.seller_fees, key)) {
        royalties.push({
          recipient: key,
          bps: metadata.collection.fees.seller_fees[key],
        });
      }
    }

    for (const key in metadata.collection.fees.opensea_fees) {
      if (Object.prototype.hasOwnProperty.call(metadata.collection.fees.opensea_fees, key)) {
        fees.push({
          recipient: key,
          bps: metadata.collection.fees.opensea_fees[key],
        });
      }
    }

    return {
      id: contract,
      slug: metadata.collection.slug,
      name: metadata.collection ? metadata.collection.name : metadata.name,
      community: communities[contract as keyof typeof communities] ?? null,
      metadata: metadata.collection ? normalizeMetadata(metadata.collection) : null,
      openseaRoyalties: royalties,
      openseaFees: fees,
      contract,
      tokenIdRange: null,
      tokenSetId: `contract:${contract}`,
      paymentTokens: metadata.collection.payment_tokens
        ? metadata.collection.payment_tokens.map((token: any) => {
            return {
              address: token.address,
              decimals: token.decimals,
              name: token.name,
              symbol: token.symbol,
            };
          })
        : undefined,
      creator: creator ? _.toLower(creator) : null,
    };
  }

  parseCollectionV2(metadata: any, contract: string, creator: string): CollectionMetadata {
    // Collect the fees
    const royalties = [];
    const fees = [];

    const openSeaFeeRecipients = [
      "0x5b3256965e7c3cf26e11fcaf296dfc8807c01073",
      "0x8de9c5a032463c561423387a9648c5c7bcc5bc90",
      "0x0000a26b00c1f0df003000390027140000faa719",
    ];

    for (const fee of metadata.fees) {
      if (openSeaFeeRecipients.includes(fee.recipient)) {
        fees.push({
          recipient: fee.recipient,
          bps: Math.trunc(fee.fee * 100),
        });
      } else {
        royalties.push({
          recipient: fee.recipient,
          bps: Math.trunc(fee.fee * 100),
        });
      }
    }

    return {
      id: contract,
      slug: metadata.collection,
      name: metadata.name,
      community: null,
      metadata: normalizeMetadata(metadata),
      openseaRoyalties: royalties,
      openseaFees: fees,
      contract,
      tokenIdRange: null,
      tokenSetId: `contract:${contract}`,
      paymentTokens: undefined,
      creator: creator ? _.toLower(creator) : null,
    };
  }

  async getDataWithCreator(
    contract: string,
    tokenId: string
  ): Promise<{ creatorAddress: string; data: any }> {
    const data = await this.getOSData("asset", contract, tokenId);

    return { data, creatorAddress: data?.creator?.address };
  }

  async getDataWithCreatorV2(
    contract: string,
    tokenId: string
  ): Promise<{ creatorAddress: string; data: any }> {
    let data;
    let creatorAddress;

    const nftData = await this.getOSData("nft", contract, tokenId);

    if (nftData?.collection) {
      data = await this.getOSDataForCollection(contract, tokenId, nftData.collection);

      creatorAddress = nftData?.creator ?? data?.owner;
    }

    return {
      data,
      creatorAddress,
    };
  }

  async getOSDataForCollection(contract: string, tokenId: string, collection: any): Promise<any> {
    return await this.getOSData("collection", contract, tokenId, collection);
  }

  async getOSDataForEventsOrAsset(contract: string, tokenId: string): Promise<any> {
    return (
      (await this.getOSData("events", contract, tokenId)) ||
      (await this.getOSData("asset", contract, tokenId))
    );
  }

  public async parseTokenMetadata(request: {
    asset_contract: {
      address: string;
    };
    collection: {
      slug: string;
    };
    token_id: string;
    name?: string;
    description?: string;
    image_url?: string;
    animation_url?: string;
    traits: Array<{
      trait_type: string;
      value: string | number | null;
    }>;
  }): Promise<TokenMetadata | null> {
    if (hasCustomHandler(request.asset_contract.address)) {
      const result = await customHandleToken({
        contract: request.asset_contract.address,
        _tokenId: request.token_id,
      });
      return result;
    }

    if (hasExtendHandler(request.asset_contract.address)) {
      const result = await extendMetadata({
        contract: request.asset_contract.address,
        slug: request.collection.slug,
        collection: request.asset_contract.address,
        flagged: null,
        tokenId: request.token_id,
        name: request.name ?? "",
        description: request.description ?? "",
        imageUrl: request.image_url ?? "",
        mediaUrl: request.animation_url ?? "",
        attributes: request.traits.map((trait) => ({
          key: trait.trait_type,
          value: trait.value,
          kind: typeof trait.value == "number" ? "number" : "string",
        })),
      });
      return result;
    }

    return {
      contract: request.asset_contract.address,
      slug: request.collection.slug,
      collection: request.asset_contract.address,
      flagged: null,
      tokenId: request.token_id,
      name: request.name ?? "",
      description: request.description ?? "",
      imageUrl: request.image_url ?? "",
      mediaUrl: request.animation_url ?? "",
      attributes: request.traits.map((trait) => ({
        key: trait.trait_type,
        value: trait.value,
        kind: typeof trait.value == "number" ? "number" : "string",
      })),
    };
  }

  isOSTestnet(): boolean {
    switch (config.chainId) {
      case 4:
      case 5:
      case 11155111:
      case 80001:
      case 84531:
      case 999:
        return true;
    }

    return false;
  }

  getUrlForApi(
    api: string,
    contract: string,
    tokenId?: string,
    network?: string,
    slug?: string
  ): string {
    const baseUrl = `${
      !this.isOSTestnet() ? "https://api.opensea.io" : "https://testnets-api.opensea.io"
    }`;

    switch (api) {
      case "asset":
        return `${baseUrl}/api/v1/asset/${contract}/${tokenId}`;
      case "events":
        return `${baseUrl}/api/v1/events?asset_contract_address=${contract}&token_id=${tokenId}`;
      case "offers":
        return `${baseUrl}/v2/orders/${network}/seaport/offers?asset_contract_address=${contract}&token_ids=${tokenId}`;
      case "asset_contract":
        return `${baseUrl}/api/v1/asset_contract/${contract}`;
      case "collection":
        return `${baseUrl}/api/v2/collections/${slug}`;
      case "nft":
        return `${baseUrl}/v2/chain/${network}/contract/${contract}/nfts/${tokenId}`;
      default:
        throw new Error(`Unknown API for metadata provider opensea: ${api}`);
    }
  }

  async getOSData(api: string, contract: string, tokenId?: string, slug?: string): Promise<any> {
    const network = getOpenseaNetworkName();
    const url = this.getUrlForApi(api, contract, tokenId, network!, slug);

    const headers = !this.isOSTestnet()
      ? {
          url,
          "X-API-KEY": config.openSeaCollectionMetadataApiKey.trim(),
          Accept: "application/json",
        }
      : {
          Accept: "application/json",
        };

    try {
      const osResponse = await axios.get(!this.isOSTestnet() ? config.openSeaApiUrl || url : url, {
        headers,
      });

      switch (api) {
        case "events":
          // Fallback to offers API if we get a collection from the wrong chain
          if (network == osResponse.data.asset_events[0]?.asset.asset_contract.chain_identifier) {
            return osResponse.data.asset_events[0]?.asset;
          } else {
            return await this.getOSData("offers", contract, tokenId);
          }
        case "offers":
          return osResponse.data.orders[0]?.taker_asset_bundle.assets[0];
        case "asset":
        case "asset_contract":
        case "collection":
          return osResponse.data;
        case "nft":
          return osResponse.data.nft;
      }
    } catch (error: any) {
      if (api === "asset") {
        logger.error(
          "opensea-fetcher",
          JSON.stringify({
            topic: "getOSData",
            message: "Retrieve asset error.",
            url,
            contract,
            tokenId,
            error,
          })
        );

        // Try to get the collection only based on the contract.
        if (error.response?.status === 404) {
          if (isNaN(Number(tokenId))) {
            logger.error(
              "opensea-fetcher",
              `fetchCollection retrieve asset contract - Invalid tokenId. contract:${contract}, tokenId:${tokenId}`
            );

            throw new Error(`Invalid tokenId.`);
          }
          return await this.getOSData("asset_contract", contract);
        } else {
          throw error;
        }
      } else {
        logger.error(
          "opensea-fetcher",
          JSON.stringify({
            topic: "getOSData",
            message: `Could not fetch from API. responseData=${JSON.stringify(
              error.response?.data
            )}`,
            url,
            contract,
            tokenId,
            error,
          })
        );
      }
    }
  }
}

export const openseaMetadataProvider = new OpenseaMetadataProvider();

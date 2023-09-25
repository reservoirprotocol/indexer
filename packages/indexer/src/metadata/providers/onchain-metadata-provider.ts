/* eslint-disable @typescript-eslint/no-explicit-any */

import { config } from "@/config/index";
import { CollectionMetadata, TokenMetadata, TokenMetadataBySlugResult } from "../types";

import { baseProvider } from "@/common/provider";
import { defaultAbiCoder } from "ethers/lib/utils";
import { logger } from "@/common/logger";
import { ethers } from "ethers";
import { RequestWasThrottledError, normalizeLink, normalizeMetadata } from "./utils";
import _ from "lodash";
import { AbstractBaseMetadataProvider } from "./abstract-base-metadata-provider";

const erc721Interface = new ethers.utils.Interface([
  "function supportsInterface(bytes4 interfaceId) view returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
]);

const erc1155Interface = new ethers.utils.Interface([
  "function supportsInterface(bytes4 interfaceId) view returns (bool)",
  "function balanceOf(address account, uint256 id) view returns (uint256)",
]);

export class OnchainMetadataProvider extends AbstractBaseMetadataProvider {
  method = "onchain";

  // get metadata methods

  async _getTokensMetadata(
    tokens: { contract: string; tokenId: string }[]
  ): Promise<TokenMetadata[]> {
    const tokenData: {
      contract: string;
      tokenId: string;
      standard?: string;
      requestId?: number;
    }[] = tokens;

    // Detect token standard, batch contract addresses together to call once per contract
    const contracts: string[] = [];
    tokenData.forEach((token) => {
      if (!contracts.includes(token.contract)) {
        contracts.push(token.contract);
      }
    });

    const standards = await Promise.all(
      contracts.map(async (contract) => {
        const standard = await this.detectTokenStandard(contract);
        return {
          contract,
          standard,
        };
      })
    );

    // Map the token to the standard
    tokenData.forEach((token) => {
      const standard = standards.find((standard) => standard.contract === token.contract);
      if (standard) token.standard = standard.standard;
    });

    // We need to have some type of hash map to map the tokenid + contract to the tokenURI
    const idToToken: any = {};
    tokenData.forEach((token) => {
      const randomInt = Math.floor(Math.random() * 100000);
      idToToken[randomInt] = token;
      token.requestId = randomInt;
    });

    const encodedTokens = tokenData.map((token) => {
      if (token.standard === "ERC721") {
        return this.encodeTokenERC721(token);
      } else if (token.standard === "ERC1155") {
        return this.encodeTokenERC1155(token);
      } else {
        return null;
      }
    });
    const [batch, error] = await this.sendBatch(encodedTokens);
    if (error) {
      logger.error("onchain-fetcher", `fetchTokens sendBatch error. error:${error}`);

      if (error.status === 429) {
        throw new RequestWasThrottledError(error.message, 10);
      }

      throw error;
    }

    const resolvedMetadata = await Promise.all(
      batch.map(async (token: any) => {
        const uri = defaultAbiCoder.decode(["string"], token.result)[0];
        if (!uri || uri === "") {
          return {
            contract: idToToken[token.id].contract,
            tokenId: idToToken[token.id].tokenId,
            error: "Unable to decode tokenURI from contract",
          };
        }

        const [metadata, error] = await this.getTokenMetadataFromURI(uri);
        if (error) {
          // logger.error(
          //   "onchain-fetcher",
          //   JSON.stringify({
          //     message: "fetchTokens getTokenMetadataFromURI error",
          //     chainId,
          //     token,
          //     error,
          //     uri,
          //   })
          // );

          if (error === 429) {
            throw new RequestWasThrottledError(error.message, 10);
          }

          throw error;
        }

        return {
          ...metadata,
          contract: idToToken[token.id].contract,
          tokenId: idToToken[token.id].tokenId,
        };
      })
    );

    return resolvedMetadata.map((token) => {
      return this.parseToken(token);
    });
  }

  async _getCollectionMetadata(contract: string): Promise<CollectionMetadata> {
    const collection = await this.getCollectionMetadata(contract);
    let collectionName = collection?.name ?? null;

    // Fallback for collection name if collection metadata not found
    if (!collectionName) {
      collectionName = (await this.getContractName(contract)) ?? contract;
    }

    return this.parseCollection({
      ...collection,
      contract,
      name: collectionName,
    });
  }

  async _getTokensMetadataBySlug(): Promise<TokenMetadataBySlugResult> {
    throw new Error("Method not implemented.");
  }

  // parsers

  parseToken(metadata: any): TokenMetadata {
    return {
      contract: metadata.contract,
      slug: null,
      tokenId: metadata.tokenId,
      collection: _.toLower(metadata.contract),
      name: metadata?.name || null,
      flagged: null,
      // Token descriptions are a waste of space for most collections we deal with
      // so by default we ignore them (this behaviour can be overridden if needed).
      description: metadata.description || null,
      imageUrl: normalizeLink(metadata?.image) || null,
      imageOriginalUrl: metadata?.metadata || null,
      mediaUrl: normalizeLink(metadata?.animation_url) || null,
      attributes: (metadata.attributes || []).map((trait: any) => ({
        key: trait.trait_type ?? "property",
        value: trait.value,
        kind: typeof trait.value == "number" ? "number" : "string",
        rank: 1,
      })),
    };
  }

  parseCollection(metadata: any): CollectionMetadata {
    return {
      id: metadata.contract,
      slug: null,
      community: null,
      name: metadata?.name || null,
      metadata: normalizeMetadata(metadata),
      contract: metadata.contract,
      tokenSetId: `contract:${metadata.contract}`,
      tokenIdRange: null,
    };
  }

  // helpers

  async detectTokenStandard(contractAddress: string) {
    const provider = new ethers.providers.JsonRpcProvider(this.getRPC());
    const contract = new ethers.Contract(
      contractAddress,
      [...erc721Interface.fragments, ...erc1155Interface.fragments],
      provider
    );

    try {
      const erc721Supported = await contract.supportsInterface("0x80ac58cd");
      const erc1155Supported = await contract.supportsInterface("0xd9b67a26");

      if (erc721Supported && !erc1155Supported) {
        return "ERC721";
      } else if (!erc721Supported && erc1155Supported) {
        return "ERC1155";
      } else if (erc721Supported && erc1155Supported) {
        return "Both";
      } else {
        return "Unknown";
      }
    } catch (error) {
      logger.error(
        "onchain-fetcher",
        `detectTokenStandard error. contractAddress:${contractAddress}, error:${error}`
      );

      return "Unknown";
    }
  }

  encodeTokenERC721(token: any) {
    const iface = new ethers.utils.Interface([
      {
        name: "tokenURI",
        type: "function",
        stateMutability: "view",
        inputs: [
          {
            type: "uint256",
            name: "tokenId",
          },
        ],
      },
    ]);

    return {
      id: token.requestId,
      encodedTokenID: iface.encodeFunctionData("tokenURI", [token.tokenId]),
      contract: token.contract,
    };
  }

  encodeTokenERC1155(token: any) {
    const iface = new ethers.utils.Interface([
      {
        name: "uri",
        type: "function",
        stateMutability: "view",
        inputs: [
          {
            type: "uint256",
            name: "tokenId",
          },
        ],
      },
    ]);

    return {
      id: token.requestId,
      encodedTokenID: iface.encodeFunctionData("uri", [token.tokenId]),
      contract: token.contract,
    };
  }

  getRPC() {
    return config.baseNetworkHttpUrl;
  }

  async getContractName(contractAddress: string) {
    try {
      const contract = new ethers.Contract(
        contractAddress,
        ["function name() view returns (string)"],
        baseProvider
      );
      const name = await contract.name();
      return name;
    } catch (e) {
      logger.error(
        "onchain-fetcher",
        `getContractName error. contractAddress:${contractAddress}, error:${e}`
      );
      return null;
    }
  }

  async getCollectionMetadata(contractAddress: string) {
    try {
      const contract = new ethers.Contract(
        contractAddress,
        ["function contractURI() view returns (string)"],
        baseProvider
      );
      let uri = await contract.contractURI();
      uri = normalizeLink(uri);

      const isDataUri = uri.startsWith("data:application/json;base64,");
      if (isDataUri) {
        uri = uri.replace("data:application/json;base64,", "");
      }

      const json = isDataUri
        ? JSON.parse(Buffer.from(uri, "base64").toString("utf-8"))
        : await fetch(uri, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
            // timeout: FETCH_TIMEOUT,
            // TODO: add proxy support to avoid rate limiting
            // agent:
          }).then((response) => response.json());

      return json;
    } catch (e) {
      logger.error(
        "onchain-fetcher",
        `getCollectionMetadata error. contractAddress:${contractAddress}, error:${e}`
      );
      return null;
    }
  }

  createBatch(encodedTokens: any) {
    return encodedTokens.map((token: any) => {
      return {
        jsonrpc: "2.0",
        id: token.id,
        method: "eth_call",
        params: [
          {
            data: token.encodedTokenID,
            to: token.contract,
          },
          "latest",
        ],
      };
    });
  }

  async sendBatch(encodedTokens: any) {
    let response;
    try {
      response = await fetch(this.getRPC(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(this.createBatch(encodedTokens)),
        // timeout: FETCH_TIMEOUT,
        // TODO: add proxy support to avoid rate limiting
        // agent:
      });
      const body = await response.text();
      if (!response.ok) {
        return [
          null,
          {
            body: body,
            status: response.status,
          },
        ];
      }
      const json = JSON.parse(body);
      return [json, null];
    } catch (e: any) {
      logger.error("onchain-fetcher", `sendBatch error. error:${e}`);

      return [
        null,
        {
          message: e.message,
          status: response?.status,
        },
      ];
    }
  }

  async getTokenMetadataFromURI(uri: string) {
    try {
      if (uri.includes("ipfs://")) {
        uri = uri.replace("ipfs://", "https://ipfs.io/ipfs/");
      }

      const isDataUri = uri.startsWith("data:application/json;base64,");
      if (isDataUri) {
        uri = uri.replace("data:application/json;base64,", "");
      }

      if (isDataUri) {
        return [JSON.parse(Buffer.from(uri, "base64").toString("utf-8")), null];
      }

      // if the uri is not a valid url, return null
      if (!uri.startsWith("http")) {
        return [null, `Invalid URI: ${uri}`];
      }

      const response = await fetch(uri, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        // timeout: FETCH_TIMEOUT,
        // TODO: add proxy support to avoid rate limiting
        // agent:
      });

      if (!response.ok) {
        return [null, response.status];
      }

      const json = await response.json();
      return [json, null];
    } catch (e) {
      logger.error("onchain-fetcher", `getTokenMetadataFromURI error. error:${e}`);
      return [null, e];
    }
  }
}

export const onchainMetadataProvider = new OnchainMetadataProvider();

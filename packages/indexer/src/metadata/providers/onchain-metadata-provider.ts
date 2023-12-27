/* eslint-disable @typescript-eslint/no-explicit-any */

import { config } from "@/config/index";
import { CollectionMetadata, TokenMetadata } from "../types";

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
    tokens: { contract: string; tokenId: string; uri: string }[]
  ): Promise<TokenMetadata[]> {
    const resolvedMetadata = await Promise.all(
      tokens.map(async (token: any) => {
        const [metadata, error] = await this.getTokenMetadataFromURI(
          token.uri,
          token.contract,
          token.tokenId
        );
        if (error) {
          if (error === 429) {
            throw new RequestWasThrottledError(error.message, 10);
          }

          throw error;
        }

        return {
          ...metadata,
          ...token,
        };
      })
    );

    return resolvedMetadata.map((token) => {
      return this.parseToken(token);
    });
  }

  async _getTokensMetadataUri(tokens: { contract: string; tokenId: string }[]): Promise<
    {
      contract: string;
      tokenId: string;
      uri: string | null;
      error?: string;
    }[]
  > {
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

    let encodedTokens = tokenData.map((token) => {
      if (token.standard === "ERC721") {
        return this.encodeTokenERC721(token);
      } else if (token.standard === "ERC1155") {
        return this.encodeTokenERC1155(token);
      } else {
        return null;
      }
    });

    encodedTokens = encodedTokens.filter((token) => token !== null);
    if (encodedTokens.length === 0) {
      // return array of tokens with error
      return tokenData.map((token) => {
        return {
          contract: token.contract,
          tokenId: token.tokenId,
          uri: null,
          error: "Unsupported token standard",
        };
      });
    }

    const [batch, error] = await this.sendBatch(encodedTokens);

    if (error) {
      logger.error(
        "onchain-fetcher",
        `fetchTokens sendBatch error. error: ${JSON.stringify(error)}`
      );

      if (error.status === 429) {
        throw new RequestWasThrottledError(error.message, 10);
      }

      throw error;
    }

    const resolvedURIs = await Promise.all(
      batch.map(async (token: any) => {
        try {
          const uri = defaultAbiCoder.decode(["string"], token.result)[0];
          if (!uri || uri === "") {
            return {
              contract: idToToken[token.id].contract,
              tokenId: idToToken[token.id].tokenId,
              uri: null,
              error: "Unable to decode tokenURI from contract",
            };
          }

          return {
            contract: idToToken[token.id].contract,
            tokenId: idToToken[token.id].tokenId,
            uri,
          };
        } catch (error) {
          logger.error(
            "onchain-fetcher",
            JSON.stringify({
              topic: "fetchTokensError",
              message: `Could not fetch tokenURI.  contract=${
                idToToken[token.id].contract
              }, tokenId=${idToToken[token.id].tokenId}, error=${error}`,
              contract: idToToken[token.id].contract,
              tokenId: idToToken[token.id].tokenId,
              error,
            })
          );

          return {
            contract: idToToken[token.id].contract,
            tokenId: idToToken[token.id].tokenId,
            uri: null,
            error: "Unable to decode tokenURI from contract",
          };
        }
      })
    );

    // add tokens that are in the batch but not in the response
    // (this happens when the token doesn't exist)
    const missingTokens = tokenData.filter(
      (token) =>
        !resolvedURIs.find(
          (uri) => uri.tokenId === token.tokenId && uri.contract === token.contract
        )
    );
    missingTokens.forEach((token) => {
      resolvedURIs.push({
        contract: token.contract,
        tokenId: token.tokenId,
        uri: null,
        error: "Token not found",
      });
    });

    return resolvedURIs;
  }

  async _getCollectionMetadata(contract: string): Promise<CollectionMetadata> {
    try {
      const collection = await this.getContractURI(contract);
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
    } catch (error) {
      logger.error(
        "onchain-fetcher",
        JSON.stringify({
          topic: "fetchCollectionError",
          message: `Could not fetch collection.  contract=${contract}, error=${error}`,
          contract,
          error,
        })
      );

      return {
        id: contract,
        slug: null,
        name: contract,
        community: null,
        metadata: null,
        contract,
        tokenIdRange: null,
        tokenSetId: `contract:${contract}`,
        isFallback: true,
      };
    }
  }

  // parsers
  _parseToken(metadata: any): TokenMetadata {
    // add handling for metadata.properties, convert to attributes
    if (metadata?.properties && !metadata?.attributes) {
      metadata.attributes = Object.keys(metadata.properties).map((key) => {
        if (typeof metadata.properties[key] === "object") {
          return {
            trait_type: key,
            value: metadata.properties[key],
          };
        } else {
          return {
            trait_type: key,
            value: metadata.properties[key],
          };
        }
      });
    }

    const attributes =
      typeof metadata.attributes === "string"
        ? JSON.parse(metadata.attributes)
        : metadata?.attributes || [];

    return {
      contract: metadata.contract,
      slug: null,
      tokenURI: metadata.uri,
      tokenId: metadata.tokenId,
      collection: _.toLower(metadata.contract),
      name: metadata?.name || null,
      flagged: null,
      // Token descriptions are a waste of space for most collections we deal with
      // so by default we ignore them (this behaviour can be overridden if needed).
      description: metadata.description || null,
      imageUrl: normalizeLink(metadata?.image) || normalizeLink(metadata?.image_url) || null,
      imageOriginalUrl: metadata?.image || metadata?.image_url || null,
      animationOriginalUrl: metadata?.animation_url || null,
      mediaUrl: normalizeLink(metadata?.animation_url) || null,
      metadataOriginalUrl: this.parseIPFSURI(metadata.uri),
      attributes: attributes.map((trait: any) => ({
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
    try {
      const contract = new ethers.Contract(
        contractAddress,
        [...erc721Interface.fragments, ...erc1155Interface.fragments],
        baseProvider
      );

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
    try {
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
    } catch (error) {
      logger.error(
        "onchain-fetcher",
        `encodeTokenERC721 error. contractAddress:${token.contract}, tokenId:${token.tokenId}, error:${error}`
      );

      return null;
    }
  }

  encodeTokenERC1155(token: any) {
    try {
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
    } catch (error) {
      logger.error(
        "onchain-fetcher",
        `encodeTokenERC1155 error. contractAddress:${token.contract}, tokenId:${token.tokenId}, error:${error}`
      );

      return null;
    }
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

  async getContractURI(contractAddress: string) {
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
        `getContractURI error. contractAddress:${contractAddress}, error:${e}`
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
      logger.error("onchain-fetcher", `sendBatch error. error:${JSON.stringify(e)}`);

      return [
        null,
        {
          message: e.message,
          status: response?.status,
        },
      ];
    }
  }

  parseIPFSURI(uri: string) {
    if (uri && uri?.includes("ipfs://")) {
      uri = uri.replace("ipfs://", "https://ipfs.io/ipfs/");
    }

    return uri;
  }

  async getTokenMetadataFromURI(uri: string, contract: string, tokenId: string) {
    try {
      if (uri.startsWith("json:")) {
        uri = uri.replace("json:\n", "");
      }

      uri = this.parseIPFSURI(uri);

      if (uri.startsWith("data:application/json;base64,")) {
        uri = uri.replace("data:application/json;base64,", "");
        return [JSON.parse(Buffer.from(uri, "base64").toString("utf-8")), null];
      } else if (uri.startsWith("data:application/json")) {
        // remove everything before the first comma
        uri = uri.substring(uri.indexOf(",") + 1);
        return [JSON.parse(uri), null];
      }
      uri = uri.trim();
      if (!uri.startsWith("http")) {
        // if the uri is not a valid url, return null
        return [null, `Invalid URI: ${uri}`];
      }

      const response = await fetch(uri, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        return [null, response.status];
      }

      const json = await response.json();
      return [json, null];
    } catch (e) {
      logger.error(
        "onchain-fetcher",
        JSON.stringify({
          message: "getTokenMetadataFromURI error",
          contract,
          tokenId,
          uri,
          error: e,
        })
      );
      return [null, e];
    }
  }
}

export const onchainMetadataProvider = new OnchainMetadataProvider();

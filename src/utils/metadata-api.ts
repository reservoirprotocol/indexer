/* eslint-disable @typescript-eslint/no-explicit-any */

import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import axios from "axios";
import slugify from "slugify";

import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";
import { getNetworkName } from "@/config/network";

export class MetadataApi {
  static async getCollectionMetadata(
    contract: string,
    tokenId: string,
    options?: { allowFallback?: boolean }
  ) {
    if (config.liquidityOnly) {
      // When running in liquidity-only mode:
      // - assume the collection id matches the contract address
      // - the collection name is retrieved from an on-chain `name()` call

      const name = await new Contract(
        contract,
        new Interface(["function name() view returns (string)"]),
        baseProvider
      )
        .name()
        .catch(() => "");

      return {
        id: contract,
        slug: slugify(name, { lower: true }),
        name,
        community: null,
        metadata: null,
        royalties: null,
        contract,
        tokenIdRange: null,
        tokenSetId: `contract:${contract}`,
      };
    } else {
      const url = `${
        config.metadataApiBaseUrlAlt
      }/v4/${getNetworkName()}/metadata/collection?method=${
        config.metadataIndexingMethod
      }&token=${contract}:${tokenId}`;

      const { data } = await axios.get(url);

      const collection: {
        id: string;
        slug: string;
        name: string;
        community: string | null;
        metadata: object | null;
        royalties: object | null;
        contract: string;
        tokenIdRange: [string, string] | null;
        tokenSetId: string;
        isFallback?: boolean;
      } = (data as any).collection;

      if (collection.isFallback && !options?.allowFallback) {
        throw new Error("Fallback collection data not acceptable");
      }

      return collection;
    }
  }
}

export { MetadataApi as default };

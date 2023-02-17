import _ from "lodash";
import { redb } from "@/common/db";
import { getAllNftsRarity, NftInit } from "@poprank/rankings";
import { TraitBase } from "@poprank/rankings/lib/types";

export class Rarity {
  public static getExcludedKeys(collectionId: string) {
    const excludedKeys = new Map([
      ["0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d", ["Trait Count", "ApeCoin Staked"]],
      ["0xba30e5f9bb24caa003e9f2f0497ad287fdf95623", ["ApeCoin Staked"]],
      ["0x60e4d786628fea6478f785a6d7e704777c86a7c6", ["ApeCoin Staked"]],
    ]);

    return excludedKeys.get(collectionId) || [];
  }

  public static async getCollectionTokensRarity(collectionId: string) {
    const limit = 1000;
    let values = {
      collectionId,
    };

    let fetchMoreTokens = true;
    let tokens: {
      tokenId: string;
      attributes: {
        key: string;
        value: string;
      }[];
    }[] = [];

    // Filter any keys with more than 5000 distinct values
    const valuesCount = await Rarity.getValuesCount(collectionId);
    const excludedKeys: string[] = [];
    _.map(valuesCount, (value) => (value.count > 5000 ? excludedKeys.push(value.key) : null));
    _.map(Rarity.getExcludedKeys(collectionId), (key) => excludedKeys.push(key));

    let lastTokenId;

    // Get all tokens and their attributes for the given collection
    while (fetchMoreTokens) {
      let continuation = "";
      let keysFilter = "";

      if (lastTokenId) {
        continuation = `AND token_id > $/tokenId/`;
        values = _.merge(values, { tokenId: lastTokenId });
      }

      if (_.size(excludedKeys)) {
        keysFilter = `AND key NOT IN ('${_.join(excludedKeys, "','")}')`;
      }

      const query = `
        SELECT token_id AS "tokenId",
               array_agg(json_build_object('key', key, 'value', value)) AS "attributes"
        FROM token_attributes
        WHERE collection_id = $/collectionId/
        ${keysFilter}
        ${continuation}
        GROUP BY contract, token_id
        ORDER BY token_id ASC
        LIMIT ${limit}
    `;

      const result = await redb.manyOrNone(query, values);

      if (_.size(result)) {
        lastTokenId = _.last(result).tokenId;
      }

      tokens = _.concat(tokens, result);
      fetchMoreTokens = _.size(result) >= limit;
    }

    if (_.isEmpty(tokens)) {
      return [];
    }

    // Build an array for the rarity calculation, some of the fields are not relevant for the calculation but needs to be passed
    const nfts: NftInit[] = _.map(tokens, (result) => {
      const traits: TraitBase[] = _.map(result.attributes, (attribute) => ({
        typeValue: attribute.key,
        value: attribute.value,
        category: "Traits",
        displayType: null,
      }));

      traits.push({
        typeValue: "Trait Count",
        value: `${_.size(traits)}`,
        category: "Meta",
        displayType: null,
      });

      return {
        collection: collectionId,
        id: result.tokenId,
        name: "",
        address: collectionId,
        imageUrl: "",
        metadataUrl: "",
        rating: 0,
        timesSeen: 0,
        timesWon: 0,
        aestheticRank: 0,
        traits,
      };
    });

    // Get the score for the tokens and return
    const { nftsWithRarityAndRank } = getAllNftsRarity(nfts);
    return nftsWithRarityAndRank;
  }

  public static async getValuesCount(
    collectionId: string
  ): Promise<{ key: string; count: number }[]> {
    const query = `
      SELECT key, count(DISTINCT value) AS "count"
      FROM token_attributes
      WHERE collection_id = $/collectionId/
      GROUP BY key
    `;

    return await redb.manyOrNone(query, { collectionId });
  }
}

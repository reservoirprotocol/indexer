import _ from "lodash";
import { redb } from "@/common/db";
import { getAllNftsRarity, NftInit } from "@poprank/rankings";
import { TraitBase } from "@poprank/rankings/lib/types";

export class Rarity {
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

    let lastTokenId;

    // Get all tokens and their attributes for the given collection
    while (fetchMoreTokens) {
      let continuation = "";
      if (lastTokenId) {
        continuation = `AND token_id > $/tokenId/`;
        values = _.merge(values, { tokenId: lastTokenId });
      }

      const query = `
      SELECT token_id AS "tokenId",
             array_agg(json_build_object('key', key, 'value', value)) AS "attributes"
      FROM token_attributes
      WHERE collection_id = $/collectionId/
      ${continuation}
      GROUP BY contract, token_id
      ORDER BY contract, token_id ASC
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
}

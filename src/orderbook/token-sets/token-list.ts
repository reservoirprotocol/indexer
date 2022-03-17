import { keccak256 } from "@ethersproject/solidity";
import { generateMerkleTree } from "@reservoir0x/sdk/dist/wyvern-v2/builders/token-list/utils";
import crypto from "crypto";
import stringify from "json-stable-stringify";

import { PgPromiseQuery, idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { toBuffer } from "@/common/utils";

export type TokenSet = {
  id: string;
  schemaHash: string;
  schema?: {
    kind: "attribute";
    data: {
      collection: string;
      attributes: [
        {
          key: string;
          value: string;
        }
      ];
    };
  };
  contract: string;
  tokenIds: string[];
};

const isValid = async (tokenSet: TokenSet) => {
  try {
    // Verify that the token set id matches the underlying tokens
    const merkleTree = generateMerkleTree(tokenSet.tokenIds);
    const merkleRoot = keccak256(
      ["address", "bytes32"],
      [tokenSet.contract, merkleTree.getHexRoot()]
    );
    if (tokenSet.id !== `list:${tokenSet.contract}:${merkleRoot}`) {
      return false;
    }

    if (tokenSet.schema) {
      // If we have the schema, then validate it against the schema hash
      const schemaHash =
        "0x" +
        crypto
          .createHash("sha256")
          .update(stringify(tokenSet.schema))
          .digest("hex");
      if (schemaHash !== tokenSet.schemaHash) {
        return false;
      }

      // TODO: Support multiple attributes
      if (tokenSet.schema.data.attributes.length !== 1) {
        return false;
      }

      // Make sure the schema matches the token set definition
      const tokens = await idb.manyOrNone(
        `
          SELECT
            "ta"."token_id"
          FROM "token_attributes" "ta"
          JOIN "attributes" "a"
            ON "ta"."attribute_id" = "a"."id"
          JOIN "attribute_keys" "ak"
            ON "a"."attribute_key_id" = "ak"."id"
          WHERE "ak"."collection_id" = $/collection/
            AND "ak"."key" = $/key/
            AND "a"."value" = $/value/
        `,
        {
          collection: tokenSet.schema.data.collection,
          key: tokenSet.schema.data.attributes[0].key,
          value: tokenSet.schema.data.attributes[0].value,
        }
      );
      if (!tokens) {
        return false;
      }

      // Make sure the current attributes match the merkle root
      const merkleTree = generateMerkleTree(
        tokens.map(({ token_id }) => token_id)
      );
      if (merkleTree.getHexRoot() !== merkleRoot) {
        return false;
      }
    }
  } catch {
    return false;
  }

  return true;
};

export const save = async (tokenSets: TokenSet[]): Promise<TokenSet[]> => {
  const queries: PgPromiseQuery[] = [];

  const valid: TokenSet[] = [];
  for (const tokenSet of tokenSets) {
    if (!(await isValid(tokenSet))) {
      continue;
    }

    const { id, schemaHash, schema, contract, tokenIds } = tokenSet;
    try {
      // If the token set has a schema, get the associated attribute
      let attributeId: string | null = null;
      if (schema) {
        const attributeResult = await idb.oneOrNone(
          `
            SELECT "a"."id" FROM "attributes" "a"
            JOIN "attribute_keys" "ak"
              ON "a"."attribute_key_id" = "ak"."id"
            WHERE "ak"."collection_id" = $/collection/
              AND "ak"."key" = $/key/
              AND "a"."value" = $/value/
          `,
          {
            collection: schema.data.collection,
            key: schema.data.attributes[0].key,
            value: schema.data.attributes[0].value,
          }
        );
        if (!attributeResult) {
          continue;
        }

        attributeId = attributeResult.attribute_id;
      }

      queries.push({
        query: `
          INSERT INTO "token_sets" (
            "id",
            "schema_hash",
            "schema",
            "attribute_id"
          ) VALUES (
            $/id/,
            $/schemaHash/,
            $/schema:json/,
            $/attributeId/
          )
          ON CONFLICT DO NOTHING
        `,
        values: {
          id,
          schemaHash: toBuffer(schemaHash),
          schema,
          attributeId,
        },
      });

      // For efficiency, skip if data already exists
      const tokenSetTokensExist = await idb.oneOrNone(
        `
          SELECT 1 FROM "token_sets_tokens" "tst"
          WHERE "tst"."token_set_id" = $/tokenSetId/
          LIMIT 1
        `,
        { tokenSetId: id }
      );
      if (!tokenSetTokensExist) {
        const columns = new pgp.helpers.ColumnSet(
          ["token_set_id", "contract", "token_id"],
          { table: "token_sets_tokens" }
        );
        const values = tokenIds.map((tokenId) => ({
          token_set_id: id,
          contract: toBuffer(contract),
          token_id: tokenId,
        }));

        queries.push({
          query: `
            INSERT INTO "token_sets_tokens" (
              "token_set_id",
              "contract",
              "token_id"
            ) VALUES ${pgp.helpers.values(values, columns)}
            ON CONFLICT DO NOTHING
          `,
        });
      }

      valid.push(tokenSet);
    } catch (error) {
      logger.error(
        "orderbook-token-list-set",
        `Failed to check/save token set ${JSON.stringify(tokenSet)}: ${error}`
      );
    }
  }

  if (queries.length) {
    await idb.none(pgp.helpers.concat(queries));
  }

  return valid;
};

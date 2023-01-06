import { Common } from "@reservoir0x/sdk";

import { PgPromiseQuery, idb, pgp, redb } from "@/common/db";
import { logger } from "@/common/logger";
import { fromBuffer, toBuffer } from "@/common/utils";
import { generateSchemaHash } from "@/orderbook/orders/utils";

export type TokenSet = {
  id: string;
  schemaHash: string;
  schema?:
    | {
        kind: "attribute";
        data: {
          collection: string;
          isNonFlagged?: boolean;
          attributes: [
            {
              key: string;
              value: string;
            }
          ];
        };
      }
    | {
        kind: "collection-non-flagged";
        data: {
          collection: string;
        };
      }
    | {
        kind: "collection";
        data: {
          collection: string;
        };
      }
    | {
        kind: "token-set";
        data: {
          tokenSetId: string;
        };
      };
  items?: {
    contract: string;
    tokenIds: string[];
  };
};

const isValid = async (tokenSet: TokenSet) => {
  try {
    if (!tokenSet.items && !tokenSet.schema) {
      // In case we have no associated items or schema, we just skip the token set
      return false;
    }

    let itemsId: string | undefined;
    if (tokenSet.items) {
      // Generate the token set id corresponding to the passed items
      const merkleTree = Common.Helpers.generateMerkleTree(tokenSet.items.tokenIds);
      itemsId = `list:${tokenSet.items.contract}:${merkleTree.getHexRoot()}`;

      // Make sure the passed tokens match the token set id
      if (itemsId !== tokenSet.id) {
        return false;
      }
    }

    let schemaId: string | undefined;
    if (tokenSet.schema) {
      // Detect the token set's items from the schema

      // Validate the schema against the schema hash
      const schemaHash = generateSchemaHash(tokenSet.schema);
      if (schemaHash !== tokenSet.schemaHash) {
        return false;
      }

      let tokens: { token_id: string; contract: Buffer }[] | undefined;
      if (tokenSet.schema.kind === "attribute") {
        // TODO: Add support for multiple attributes
        if (tokenSet.schema.data.attributes.length !== 1) {
          return false;
        }

        const excludeFlaggedTokens = tokenSet.schema.data.isNonFlagged
          ? "AND (tokens.is_flagged = 0 OR tokens.is_flagged IS NULL)"
          : "";

        tokens = await redb.manyOrNone(
          `
            SELECT
              token_attributes.token_id
            FROM token_attributes
            JOIN attributes
              ON token_attributes.attribute_id = attributes.id
            JOIN attribute_keys
              ON attributes.attribute_key_id = attribute_keys.id
            JOIN tokens
              ON token_attributes.contract = tokens.contract
              AND token_attributes.token_id = tokens.token_id
            WHERE attribute_keys.collection_id = $/collection/
              AND attribute_keys.key = $/key/
              AND attributes.value = $/value/
              ${excludeFlaggedTokens}
          `,
          {
            collection: tokenSet.schema!.data.collection,
            key: tokenSet.schema!.data.attributes[0].key,
            value: tokenSet.schema!.data.attributes[0].value,
          }
        );
      } else if (tokenSet.schema.kind === "token-set") {
        tokens = await redb.manyOrNone(
          `
            SELECT
              token_sets_tokens.contract,
              token_sets_tokens.token_id
            FROM token_sets_tokens
            WHERE token_sets_tokens.token_set_id = $/tokenSetId/
          `,
          {
            tokenSetId: tokenSet.schema.data.tokenSetId,
          }
        );
      } else if (tokenSet.schema.kind.startsWith("collection")) {
        tokens = await redb.manyOrNone(
          `
            SELECT
              tokens.token_id
            FROM tokens
            WHERE tokens.collection_id = $/collection/
              ${
                tokenSet.schema.kind === "collection-non-flagged"
                  ? " AND (tokens.is_flagged = 0 OR tokens.is_flagged IS NULL)"
                  : ""
              }
          `,
          {
            collection: tokenSet.schema.data.collection,
          }
        );
      }

      if (!tokens || !tokens.length) {
        return false;
      }

      // All tokens will share the same underlying contract
      const contract = tokens[0].contract
        ? fromBuffer(tokens[0].contract)
        : // Assume the collection id always starts with the contract
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (tokenSet.schema.data as any).collection.slice(0, 42);
      const tokenIds = tokens.map(({ token_id }) => token_id);

      // Generate the token set id corresponding to the passed schema
      const merkleTree = Common.Helpers.generateMerkleTree(tokenIds);
      schemaId = `list:${contract}:${merkleTree.getHexRoot()}`;

      // Make sure the passed schema matches the token set id
      if (schemaId !== tokenSet.id) {
        return false;
      }

      // Populate the items field from the schema
      if (!itemsId) {
        tokenSet.items = { contract, tokenIds };
      }
    }

    if (!itemsId && !schemaId) {
      // Skip if we couldn't detect any valid items or schema
      return false;
    }
  } catch {
    return false;
  }

  return true;
};

export const save = async (tokenSets: TokenSet[]): Promise<TokenSet[]> => {
  const queries: PgPromiseQuery[] = [];

  const valid: Set<TokenSet> = new Set();
  for (const tokenSet of tokenSets) {
    // For efficiency, first check if the token set exists before
    // triggering a potentially-expensive validation of it
    const tokenSetExists = await redb.oneOrNone(
      `
        SELECT 1
        FROM token_sets
        WHERE token_sets.id = $/id/
        AND token_sets.schema_hash = $/schemaHash/
      `,
      {
        id: tokenSet.id,
        schemaHash: toBuffer(tokenSet.schemaHash),
      }
    );
    if (tokenSetExists) {
      // If the token set already exists, we can simply skip every other checks
      valid.add(tokenSet);
    } else if (!tokenSetExists && !(await isValid(tokenSet))) {
      continue;
    }

    const { id, schemaHash, schema, items } = tokenSet;
    try {
      if (!items) {
        // This should never happen.
        continue;
      }

      // If the token set has a schema, get the associated collection/attribute
      let attributeId: string | null = null;
      let collectionId: string | null = null;
      if (schema && schema.kind === "attribute") {
        const attributeResult = await redb.oneOrNone(
          `
            SELECT
              attributes.id
            FROM attributes
            JOIN attribute_keys
              ON attributes.attribute_key_id = attribute_keys.id
            WHERE attribute_keys.collection_id = $/collection/
              AND attribute_keys.key = $/key/
              AND attributes.value = $/value/
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

        attributeId = attributeResult.id;
      } else if (
        schema &&
        (schema.kind === "collection" || schema.kind === "collection-non-flagged")
      ) {
        collectionId = schema.data.collection;
      }

      queries.push({
        query: `
          INSERT INTO token_sets (
            id,
            schema_hash,
            schema,
            collection_id,
            attribute_id
          ) VALUES (
            $/id/,
            $/schemaHash/,
            $/schema:json/,
            $/collectionId/,
            $/attributeId/
          )
          ON CONFLICT DO NOTHING
        `,
        values: {
          id,
          schemaHash: toBuffer(schemaHash),
          schema,
          collectionId,
          attributeId,
        },
      });

      // For efficiency, skip if data already exists
      const tokenSetTokensExist = await redb.oneOrNone(
        `
          SELECT 1
          FROM token_sets_tokens
          WHERE token_sets_tokens.token_set_id = $/tokenSetId/
          LIMIT 1
        `,
        { tokenSetId: id }
      );
      if (!tokenSetTokensExist) {
        const columns = new pgp.helpers.ColumnSet(["token_set_id", "contract", "token_id"], {
          table: "token_sets_tokens",
        });
        const values = items.tokenIds.map((tokenId) => ({
          token_set_id: id,
          contract: toBuffer(items.contract),
          token_id: tokenId,
        }));

        queries.push({
          query: `
            INSERT INTO token_sets_tokens (
              token_set_id,
              contract,
              token_id
            ) VALUES ${pgp.helpers.values(values, columns)}
            ON CONFLICT DO NOTHING
          `,
        });
      }

      valid.add(tokenSet);
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

  return Array.from(valid);
};

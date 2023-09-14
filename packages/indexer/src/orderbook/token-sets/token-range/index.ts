import { PgPromiseQuery, idb, pgp, redb } from "@/common/db";
import { logger } from "@/common/logger";
import { toBuffer } from "@/common/utils";
import { generateSchemaHash } from "@/orderbook/orders/utils";

export type TokenSet = {
  id: string;
  schemaHash: string;
  // Not currently used (the token set id is a good enough schema)
  schema?: object;
  contract: string;
  startTokenId: string;
  endTokenId: string;
};

const isValid = (tokenSet: TokenSet) => {
  try {
    if (
      tokenSet.id !== `range:${tokenSet.contract}:${tokenSet.startTokenId}:${tokenSet.endTokenId}`
    ) {
      return false;
    }

    const schemaHash = generateSchemaHash(tokenSet.schema);
    if (schemaHash !== tokenSet.schemaHash) {
      return false;
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
    if (!isValid(tokenSet)) {
      continue;
    }

    const { id, schemaHash, schema, contract, startTokenId, endTokenId } = tokenSet;
    try {
      // Make sure an associated collection exists
      const collectionResult = await idb.oneOrNone(
        `
          SELECT "id" FROM "collections"
          WHERE "id" = $/id/
        `,
        {
          id: `${contract}:${startTokenId}:${endTokenId}`,
        }
      );
      if (!collectionResult) {
        continue;
      }

      queries.push({
        query: `
          INSERT INTO "token_sets" (
            "id",
            "schema_hash",
            "schema",
            "collection_id"
          ) VALUES (
            $/id/,
            $/schemaHash/,
            $/schema:json/,
            $/collection/
          )
          ON CONFLICT DO NOTHING
        `,
        values: {
          id,
          schemaHash: toBuffer(schemaHash),
          schema,
          collection: collectionResult.id,
        },
      });

      // For efficiency, skip if data already exists
      const tokenSetTokensExist = await redb.oneOrNone(
        `
          SELECT 1 FROM "token_sets_tokens" "tst"
          WHERE "tst"."token_set_id" = $/tokenSetId/
          LIMIT 1
        `,
        { tokenSetId: id }
      );
      if (!tokenSetTokensExist) {
        queries.push({
          query: `
            INSERT INTO "token_sets_tokens" (
              "token_set_id",
              "contract",
              "token_id"
            ) (
              SELECT
                $/tokenSetId/,
                $/contract/,
                "t"."token_id"
              FROM "tokens" "t"
              WHERE "t"."contract" = $/contract/
                AND "t"."token_id" >= $/startTokenId/
                AND "t"."token_id" <= $/endTokenId/
            )
            ON CONFLICT DO NOTHING
          `,
          values: {
            tokenSetId: tokenSet.id,
            contract: toBuffer(contract),
            startTokenId,
            endTokenId,
          },
        });
      }

      valid.push(tokenSet);
    } catch (error) {
      logger.error(
        "orderbook-token-range-set",
        `Failed to check/save token set ${JSON.stringify(tokenSet)}: ${error}`
      );
    }
  }

  if (queries.length) {
    await idb.none(pgp.helpers.concat(queries));
  }

  return valid;
};

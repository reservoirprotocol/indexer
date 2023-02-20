import _ from "lodash";

import { PgPromiseQuery, idb, pgp, redb } from "@/common/db";
import { logger } from "@/common/logger";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";

export type TokenSet = {
  id: string;
  schemaHash: string;
  // Not currently used (the token set id is a good enough schema)
  schema?: object;
  contract: string;
};

const isValid = (tokenSet: TokenSet) => {
  try {
    if (tokenSet.id !== `contract:${tokenSet.contract}`) {
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
      throw new Error("Invalid token set");
    }

    const { id, schemaHash, schema, contract } = tokenSet;
    try {
      // Make sure an associated collection exists
      const collectionResult = await idb.oneOrNone(
        `
          SELECT
            collections.id,
            collections.token_count
          FROM collections
          WHERE collections.id = $/id/
        `,
        {
          id: contract,
        }
      );
      if (!collectionResult || Number(collectionResult.token_count) > config.maxTokenSetSize) {
        // We don't support collection orders on large collections
        throw new Error("Collection missing or too large");
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
            )
            ON CONFLICT DO NOTHING
          `,
          values: {
            tokenSetId: tokenSet.id,
            contract: toBuffer(contract),
          },
        });
      }

      valid.push(tokenSet);
    } catch (error) {
      logger.info(
        "orderbook-contract-wide-set",
        `Failed to check/save token set ${JSON.stringify(tokenSet)}: ${error}`
      );
    }
  }

  if (queries.length) {
    await idb.none(pgp.helpers.concat(queries));
  }

  if (_.isEmpty(valid)) {
    return [
      {
        id: "",
        schemaHash: "",
        contract: "",
      },
    ];
  }

  return valid;
};

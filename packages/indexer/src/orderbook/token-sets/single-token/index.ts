import { PgPromiseQuery, idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { toBuffer } from "@/common/utils";

export type TokenSet = {
  id: string;
  schemaHash: string;
  // Not currently used (the token set id is a good enough schema)
  schema?: object;
  contract: string;
  tokenId: string;
};

const isValid = (tokenSet: TokenSet) => {
  try {
    if (tokenSet.id !== `token:${tokenSet.contract}:${tokenSet.tokenId}`) {
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

    const { id, schemaHash, schema, contract, tokenId } = tokenSet;
    try {
      queries.push({
        query: `
          INSERT INTO "token_sets" (
            "id",
            "schema_hash",
            "schema"
          ) VALUES (
            $/id/,
            $/schemaHash/,
            $/schema:json/
          )
          ON CONFLICT DO NOTHING
        `,
        values: {
          id,
          schemaHash: toBuffer(schemaHash),
          schema,
        },
      });

      queries.push({
        query: `
          INSERT INTO "token_sets_tokens" (
            "token_set_id",
            "contract",
            "token_id"
          ) VALUES (
            $/tokenSetId/,
            $/contract/,
            $/tokenId/
          )
          ON CONFLICT DO NOTHING
        `,
        values: {
          tokenSetId: tokenSet.id,
          contract: toBuffer(contract),
          tokenId,
        },
      });

      valid.push(tokenSet);
    } catch (error) {
      logger.error(
        "orderbook-single-token-set",
        `Failed to check/save token set ${JSON.stringify(tokenSet)}: ${error}`
      );
    }
  }

  if (queries.length) {
    await idb.none(pgp.helpers.concat(queries));
  }

  return valid;
};

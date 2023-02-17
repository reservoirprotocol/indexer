import { PgPromiseQuery, idb, pgp, redb } from "@/common/db";
import { logger } from "@/common/logger";
import { toBuffer } from "@/common/utils";

export type TokenSet = {
  id: string;
  schemaHash: string;
  items: {
    tokens: string[];
  };
};

export const save = async (tokenSets: TokenSet[]): Promise<TokenSet[]> => {
  const queries: PgPromiseQuery[] = [];

  const valid: Set<TokenSet> = new Set();
  for (const tokenSet of tokenSets) {
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
      // If the token set already exists, we can simply skip any other further actions
      valid.add(tokenSet);
      continue;
    }

    const { id, schemaHash, items } = tokenSet;
    try {
      queries.push({
        query: `
          INSERT INTO token_sets (
            id,
            schema_hash
          ) VALUES (
            $/id/,
            $/schemaHash/
          )
          ON CONFLICT DO NOTHING
        `,
        values: {
          id,
          schemaHash: toBuffer(schemaHash),
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
        const values = items.tokens.map((token) => ({
          token_set_id: id,
          contract: toBuffer(token.split(":")[0]),
          token_id: token.split(":")[1],
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
        "orderbook-mixed-token-list-set",
        `Failed to check/save token set ${JSON.stringify(tokenSet)}: ${error}`
      );
    }
  }

  if (queries.length) {
    await idb.none(pgp.helpers.concat(queries));
  }

  return Array.from(valid);
};

import { Common } from "@reservoir0x/sdk";

import { PgPromiseQuery, idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { fromBuffer, toBuffer } from "@/common/utils";
import { generateSchemaHash } from "@/orderbook/orders/utils";
import { TokenSet, TSTCollectionNonFlagged } from "@/orderbook/token-sets/utils";

export type Metadata = {
  collection: string;
};

const internalGetTokenSet = (metadata: Metadata) => {
  // Generate schema
  const schema: TSTCollectionNonFlagged = {
    kind: "collection-non-flagged",
    data: {
      collection: metadata.collection,
    },
  };

  // Generate token set
  const tokenSet = {
    id: `dynamic:collection-non-flagged:${metadata.collection}`,
    schemaHash: generateSchemaHash(schema),
    schema,
  };

  return tokenSet;
};

export const get = async (metadata: Metadata): Promise<TokenSet & { merkleRoot?: string }> => {
  const tokenSet = internalGetTokenSet(metadata);
  return {
    ...tokenSet,
    merkleRoot: await idb
      .oneOrNone(
        `
          SELECT
            coalesce(token_sets.metadata, '{}') AS metadata
          FROM token_sets
          WHERE token_sets.id = $/id/
            AND token_sets.schema_hash = $/schemaHash/
        `,
        {
          id: tokenSet.id,
          schemaHash: toBuffer(tokenSet.schemaHash),
        }
      )
      .then((result) => result?.metadata.merkleRoot),
  };
};

export const save = async (
  metadata: Metadata,
  checkAgainstMerkleRoot?: string,
  forceRefresh?: boolean
): Promise<TokenSet | undefined> => {
  const tokenSet = internalGetTokenSet(metadata);

  // If the token set already exists, we can simply skip any other further actions
  const tokenSetResult = await idb.oneOrNone(
    `
      SELECT
        coalesce(token_sets.metadata, '{}') AS metadata
      FROM token_sets
      JOIN token_sets_tokens
        ON token_sets.id = token_sets_tokens.token_set_id
      WHERE token_sets.id = $/id/
      LIMIT 1
    `,
    {
      id: tokenSet.id,
    }
  );
  if (tokenSetResult && !forceRefresh) {
    // If specified, check the current token set's merkle root
    if (checkAgainstMerkleRoot && tokenSetResult.metadata.merkleRoot !== checkAgainstMerkleRoot) {
      return undefined;
    }
    return tokenSet;
  }

  const queries: PgPromiseQuery[] = [];
  try {
    // Fetch the collection's contract
    const contract = await idb
      .oneOrNone(
        `
          SELECT
            collections.contract
          FROM collections
          WHERE collections.id = $/collection/
        `,
        {
          collection: tokenSet.schema.data.collection,
        }
      )
      .then((result) => fromBuffer(result.contract));

    // Fetch all non-flagged tokens from the collection
    const items = await idb.manyOrNone(
      `
        SELECT
          tokens.token_id
        FROM tokens
        WHERE tokens.collection_id = $/collection/
          AND (tokens.is_flagged = 0 OR tokens.is_flagged IS NULL)
      `,
      {
        collection: tokenSet.schema.data.collection,
      }
    );

    // We cache the merkle root in the `metadata` field since we'll need
    // to check it for untrusted sources (eg. native Reservoir orders)
    const merkleRoot = Common.Helpers.generateMerkleTree(
      items.map(({ token_id }) => token_id)
    ).getHexRoot();

    // Insert into the `token_sets` table
    queries.push({
      query: `
        INSERT INTO token_sets (
          id,
          schema_hash,
          schema,
          collection_id,
          metadata
        ) VALUES (
          $/id/,
          $/schemaHash/,
          $/schema:json/,
          $/collection/,
          $/metadata:json/
        )
        ON CONFLICT (id, schema_hash)
        DO UPDATE SET
          metadata = $/metadata:json/
      `,
      values: {
        id: tokenSet.id,
        schemaHash: toBuffer(tokenSet.schemaHash),
        schema: tokenSet.schema,
        collection: tokenSet.schema.data.collection,
        metadata: { merkleRoot },
      },
    });

    // Insert into the `token_sets_tokens` table
    const columns = new pgp.helpers.ColumnSet(["token_set_id", "contract", "token_id"], {
      table: "token_sets_tokens",
    });
    const values = items.map(({ token_id }) => ({
      token_set_id: tokenSet.id,
      contract: toBuffer(contract),
      token_id,
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

    if (queries.length) {
      await idb.none(pgp.helpers.concat(queries));
    }
  } catch (error) {
    logger.error(
      "token-sets",
      JSON.stringify({
        kind: "dynamic-collection-non-flagged",
        error,
        tokenSet,
      })
    );
    return undefined;
  }

  return tokenSet;
};

export const update = async (
  metadata: Metadata,
  token: { contract: string; tokenId: string },
  updateKind: "add" | "remove"
) => {
  const tokenSet = internalGetTokenSet(metadata);
  updateKind === "add"
    ? await idb.none(
        `
          INSERT INTO token_sets_tokens (
            token_set_id,
            contract,
            token_id
          ) VALUES (
            $/id/,
            $/contract/,
            $/tokenId/
          ) ON CONFLICT DO NOTHING
        `,
        {
          id: tokenSet.id,
          contract: toBuffer(token.contract),
          tokenId: token.tokenId,
        }
      )
    : await idb.none(
        `
          DELETE FROM token_sets_tokens
          WHERE token_set_id = $/id/
            AND contract = $/contract/
            AND token_id = $/tokenId/
        `,
        {
          id: tokenSet.id,
          contract: toBuffer(token.contract),
          tokenId: token.tokenId,
        }
      );

  // Recalculate the cached merkle root

  const items = await idb.manyOrNone(
    `
      SELECT
        token_sets_tokens.token_id
      FROM token_sets_tokens
      WHERE token_sets_tokens.token_set_id = $/id/
    `,
    {
      id: tokenSet.id,
    }
  );

  const merkleRoot = Common.Helpers.generateMerkleTree(
    items.map(({ token_id }) => token_id)
  ).getHexRoot();
  await idb.none(
    `
      UPDATE token_sets SET
        metadata = $/metadata:json/
      WHERE id = $/id/
    `,
    {
      id: tokenSet.id,
      metadata: { merkleRoot },
    }
  );
};

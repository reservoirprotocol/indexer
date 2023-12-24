import { ridb } from "@/common/db";
import { Sources } from "@/models/sources";
import { fromBuffer, toBuffer } from "@/common/utils";
import { BaseDataSource } from "@/jobs/data-export/data-sources/index";
import crypto from "crypto";

export class TokensDataSource extends BaseDataSource {
  public async getSequenceData(cursor: CursorInfo | null, limit: number) {
    let continuationFilter = "";

    if (cursor) {
      continuationFilter = `WHERE ("t"."updated_at", "t"."contract", "t"."token_id") > (to_timestamp($/updatedAt/), $/contract/, $/tokenId/)`;
    }

    const query = `
        SELECT
          "t"."contract",
          "t"."token_id",
          "t"."name",
          "t"."description",
          "t"."collection_id",
          "t"."last_sell_value",
          "t"."last_sell_timestamp",
          (
            SELECT "nb"."owner" FROM "nft_balances" "nb"
            WHERE "nb"."contract" = "t"."contract"
              AND "nb"."token_id" = "t"."token_id"
              AND "nb"."amount" > 0
            LIMIT 1
          ) AS "owner",
          "t"."floor_sell_id",
          "t"."floor_sell_value",
          "t"."floor_sell_maker",
          "t"."floor_sell_valid_from",
          "t"."floor_sell_valid_to",
          "t"."floor_sell_source_id_int",
          "t"."created_at",
          extract(epoch from "t"."updated_at") "updated_ts"
        FROM "tokens" "t"
        ${continuationFilter}
        ORDER BY "t"."updated_at", "t"."contract", "t"."token_id"
        LIMIT $/limit/;  
      `;

    const result = await ridb.manyOrNone(query, {
      contract: cursor?.contract ? toBuffer(cursor.contract) : null,
      tokenId: cursor?.tokenId,
      updatedAt: cursor?.updatedAt,
      limit,
    });

    if (result.length) {
      const sources = await Sources.getInstance();

      const data = result.map((r) => {
        const floor_ask_source = sources.get(r.floor_sell_source_id_int);
        return {
          id: crypto
            .createHash("sha256")
            .update(`${fromBuffer(r.contract)}${r.token_id}`)
            .digest("hex"),
          contract: fromBuffer(r.contract),
          token_id: r.token_id,
          name: r.name,
          description: r.description,
          collection_id: r.collection_id,
          owner: r.owner ? fromBuffer(r.owner) : null,
          floor_ask_id: r.floor_sell_id,
          floor_ask_value: r.floor_sell_value ? r.floor_sell_value.toString() : null,
          floor_ask_maker: r.floor_sell_maker ? fromBuffer(r.floor_sell_maker) : null,
          floor_ask_valid_from: r.floor_sell_valid_from ? r.floor_sell_valid_from : null,
          floor_ask_valid_to: r.floor_sell_valid_to ? r.floor_sell_valid_to : null,
          floor_ask_source: floor_ask_source ? floor_ask_source.name : null,
          last_sale_value: r.last_sell_value ? r.last_sell_value.toString() : null,
          last_sale_timestamp: r.last_sell_timestamp,
          created_at: new Date(r.created_at).toISOString(),
          updated_at: new Date(r.updated_ts * 1000).toISOString(),
        };
      });

      const lastResult = result[result.length - 1];

      return {
        data,
        nextCursor: {
          contract: fromBuffer(lastResult.contract),
          tokenId: lastResult.token_id,
          updatedAt: lastResult.updated_ts,
        },
      };
    }

    return { data: [], nextCursor: null };
  }
}

export class TokensDataSourceV2 extends BaseDataSource {
  public async getSequenceData(cursor: CursorInfo | null, limit: number) {
    let continuationFilter = "";

    if (cursor) {
      continuationFilter = `AND ("t"."updated_at", "t"."contract", "t"."token_id") > (to_timestamp($/updatedAt/), $/contract/, $/tokenId/)`;
    }

    const query = `
        SELECT
          "t"."contract",
          "t"."token_id",
          "t"."name",
          "t"."description",
          "t"."collection_id",
          "t"."last_sell_value",
          "t"."last_sell_timestamp",
          (
            SELECT "nb"."owner" FROM "nft_balances" "nb"
            WHERE "nb"."contract" = "t"."contract"
              AND "nb"."token_id" = "t"."token_id"
              AND "nb"."amount" > 0
            LIMIT 1
          ) AS "owner",
          "t"."floor_sell_id",
          "t"."floor_sell_value",
          "t"."floor_sell_maker",
          "t"."floor_sell_valid_from",
          "t"."floor_sell_valid_to",
          "t"."floor_sell_source_id_int",
          "t"."created_at",
          extract(epoch from "t"."updated_at") "updated_ts"
        FROM "tokens" "t"
        WHERE "t"."updated_at" < NOW() - INTERVAL '1 minutes'
        ${continuationFilter}
        ORDER BY "t"."updated_at", "t"."contract", "t"."token_id"
        LIMIT $/limit/;  
      `;

    const result = await ridb.manyOrNone(query, {
      contract: cursor?.contract ? toBuffer(cursor.contract) : null,
      tokenId: cursor?.tokenId,
      updatedAt: cursor?.updatedAt,
      limit,
    });

    if (result.length) {
      const sources = await Sources.getInstance();

      const data = result.map((r) => ({
        id: crypto
          .createHash("sha256")
          .update(`${fromBuffer(r.contract)}${r.token_id}`)
          .digest("hex"),
        contract: fromBuffer(r.contract),
        token_id: r.token_id,
        name: r.name,
        description: r.description,
        collection_id: r.collection_id,
        owner: r.owner ? fromBuffer(r.owner) : null,
        floor_ask_id: r.floor_sell_id,
        floor_ask_value: r.floor_sell_value ? r.floor_sell_value.toString() : null,
        floor_ask_maker: r.floor_sell_maker ? fromBuffer(r.floor_sell_maker) : null,
        floor_ask_valid_from: r.floor_sell_valid_from ? r.floor_sell_valid_from : null,
        floor_ask_valid_to: r.floor_sell_valid_to ? r.floor_sell_valid_to : null,
        floor_ask_source: sources.get(r.floor_sell_source_id_int)?.name,
        last_sale_value: r.last_sell_value ? r.last_sell_value.toString() : null,
        last_sale_timestamp: r.last_sell_timestamp,
        created_at: new Date(r.created_at).toISOString(),
        updated_at: new Date(r.updated_ts * 1000).toISOString(),
      }));

      const lastResult = result[result.length - 1];

      return {
        data,
        nextCursor: {
          contract: fromBuffer(lastResult.contract),
          tokenId: lastResult.token_id,
          updatedAt: lastResult.updated_ts,
        },
      };
    }

    return { data: [], nextCursor: null };
  }
}

type CursorInfo = {
  contract: string;
  tokenId: number;
  updatedAt: string;
};

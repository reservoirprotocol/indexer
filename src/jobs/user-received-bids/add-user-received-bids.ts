import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { idb } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";

const QUEUE_NAME = "add-user-received-bids-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 100,
    removeOnFail: 100,
    timeout: 60 * 1000,
  },
});

new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

export const BATCH_SIZE = 500;

if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { orderId, contract, tokenId } = job.data as AddUserReceivedBidsParams;

      let continuationFilter = "";

      if (contract && tokenId) {
        continuationFilter = `AND (contract, token_id) > ($/contract/, $/tokenId/)`;
      }

      const order = await idb.oneOrNone(
        `
              SELECT
                orders.id,
                orders.source_id_int,
                orders.token_set_id,
                orders.maker,
                orders.price,
                orders.value,
                orders.quantity_remaining,
                orders.valid_between,
                orders.expiration,
                orders.created_at
              FROM orders
              WHERE orders.id = $/orderId/
              LIMIT 1
            `,
        { orderId }
      );

      const query = `
        WITH "z" AS (
          SELECT
            "y"."address",
            "x"."contract",
            MAX("x"."token_id") as "token_id"
          FROM (
            SELECT "tst"."contract", "tst"."token_id"
            FROM "token_sets_tokens" "tst"
            WHERE "token_set_id" = $/tokenSetId/
            ${continuationFilter}
            ORDER BY contract, token_id ASC
            LIMIT ${BATCH_SIZE}
          ) "x" LEFT JOIN LATERAL (
            SELECT
              "nb"."owner" as "address"
            FROM "nft_balances" "nb"
            WHERE "nb"."contract" = "x"."contract"
              AND "nb"."token_id" = "x"."token_id"
              AND "nb"."amount" > 0
          ) "y" ON TRUE
          GROUP BY "y"."address", "x"."contract"
        ), y AS (
          INSERT INTO "user_received_bids" (
            address,
            contract,
            token_set_id,
            order_id,
            order_source_id_int,
            order_created_at,
            maker,
            price,
            value,
            quantity,
            valid_between,
            clean_at,
            metadata
          )
          SELECT
            address,
            contract,
            $/tokenSetId/,
            $/orderId/,
            $/orderSourceIdInt/,
            $/orderCreatedAt/::TIMESTAMPTZ,
            $/maker/::BYTEA,
            $/price/::NUMERIC(78, 0),
            $/value/::NUMERIC(78, 0),
            $/quantity/::NUMERIC(78, 0),
            $/validBetween/::TSTZRANGE,
            LEAST($/expiration/::TIMESTAMPTZ, now() + interval '24 hours'),
            (
              CASE
                WHEN $/tokenSetId/ LIKE 'token:%' THEN
                  (SELECT
                    json_build_object(
                      'kind', 'token',
                      'data', json_build_object(
                        'collectionName', collections.name,
                        'tokenName', tokens.name,
                        'image', tokens.image
                      )
                    )
                  FROM tokens
                  JOIN collections
                    ON tokens.collection_id = collections.id
                  WHERE tokens.contract = decode(substring(split_part($/tokenSetId/, ':', 2) from 3), 'hex')
                    AND tokens.token_id = (split_part($/tokenSetId/, ':', 3)::NUMERIC(78, 0)))
    
                WHEN $/tokenSetId/ LIKE 'contract:%' THEN
                  (SELECT
                    json_build_object(
                      'kind', 'collection',
                      'data', json_build_object(
                        'collectionName', collections.name,
                        'image', (collections.metadata ->> 'imageUrl')::TEXT
                      )
                    )
                  FROM collections
                  WHERE collections.id = substring($/tokenSetId/ from 10))
    
                WHEN $/tokenSetId/ LIKE 'range:%' THEN
                  (SELECT
                    json_build_object(
                      'kind', 'collection',
                      'data', json_build_object(
                        'collectionName', collections.name,
                        'image', (collections.metadata ->> 'imageUrl')::TEXT
                      )
                    )
                  FROM collections
                  WHERE collections.id = substring($/tokenSetId/ from 7))
    
                WHEN $/tokenSetId/ LIKE 'list:%' THEN
                  (SELECT
                    json_build_object(
                      'kind', 'attribute',
                      'data', json_build_object(
                        'collectionName', collections.name,
                        'attributes', ARRAY[json_build_object('key', attribute_keys.key, 'value', attributes.value)],
                        'image', (collections.metadata ->> 'imageUrl')::TEXT
                      )
                    )
                  FROM token_sets
                  JOIN attributes
                    ON token_sets.attribute_id = attributes.id
                  JOIN attribute_keys
                    ON attributes.attribute_key_id = attribute_keys.id
                  JOIN collections
                    ON attribute_keys.collection_id = collections.id
                  WHERE token_sets.id = $/tokenSetId/)
                ELSE NULL
              END
            ) AS metadata
            FROM z 
            WHERE "z"."address" IS NOT NULL 
            ON CONFLICT DO NOTHING
        )
        SELECT contract, token_id
        FROM z
        ORDER BY contract, token_id DESC
        LIMIT 1
      `;

      const result = await idb.oneOrNone(query, {
        tokenSetId: order.token_set_id,
        orderId: order.id,
        orderSourceIdInt: order.source_id_int,
        orderCreatedAt: order.created_at,
        maker: order.maker,
        price: order.price,
        value: order.value,
        quantity: order.quantity_remaining,
        validBetween: order.valid_between,
        expiration: order.expiration,
        contract: contract ? toBuffer(contract) : null,
        tokenId,
      });

      if (!order.token_set_id.startsWith("token:") && result) {
        await addToQueue([
          {
            orderId,
            contract: fromBuffer(result.contract),
            tokenId: result.token_id,
          },
        ]);
      }
    },
    {
      connection: redis.duplicate(),
      concurrency: 3,
    }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type AddUserReceivedBidsParams = {
  orderId: string;
  contract?: string | null;
  tokenId?: string | null;
};

export const addToQueue = async (jobs: AddUserReceivedBidsParams[]) => {
  await queue.addBulk(
    jobs.map((job) => ({
      name: job.orderId,
      data: job,
    }))
  );
};

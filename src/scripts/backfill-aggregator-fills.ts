/* eslint-disable no-console */

import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import pLimit from "p-limit";

import { idb, pgp } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";
import * as utils from "@/events-sync/utils";
import { Sources } from "@/models/sources";

const main = async () => {
  console.log("Syncing sources");

  await Sources.getInstance();
  await Sources.forceDataReload();

  console.log("Fetching entries");

  const contract = "0x3729014ef28f01b3ddcf7f980d925e0b71b1f847";
  const results = await idb.manyOrNone(
    `
      SELECT
        fill_events_2.tx_hash,
        fill_events_2.log_index,
        fill_events_2.batch_index,
        fill_events_2.order_kind,
        fill_events_2.taker
      FROM fill_events_2
      JOIN transactions
        ON fill_events_2.tx_hash = transactions.hash
      WHERE transactions.to = $/contract/
    `,
    { contract: toBuffer(contract) }
  );

  console.log("Processing entries");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const values: any[] = [];
  const columns = new pgp.helpers.ColumnSet(
    ["tx_hash", "log_index", "batch_index", "taker", "fill_source_id", "aggregator_source_id"],
    {
      table: "fill_events_2",
    }
  );

  const limit = pLimit(20);
  await Promise.all(
    results.map((result) =>
      limit(async () => {
        let taker = fromBuffer(result.taker);

        const txHash = fromBuffer(result.tx_hash);
        const attributionData = await utils.extractAttributionData(txHash, result.order_kind);
        if (attributionData.taker) {
          taker = attributionData.taker;
        }

        values.push({
          tx_hash: result.tx_hash,
          log_index: result.log_index,
          batch_index: result.batch_index,
          taker: toBuffer(taker),
          fill_source_id: attributionData.fillSource?.id,
          aggregator_source_id: attributionData.aggregatorSource?.id,
        });
      })
    )
  );

  console.log("Updating entries");

  if (values.length) {
    await idb.none(
      `
        UPDATE fill_events_2 SET
          aggregator_source_id = x.aggregator_source_id::INT,
          fill_source_id = x.fill_source_id::INT,
          taker = x.taker::BYTEA,
          updated_at = now()
        FROM (
          VALUES ${pgp.helpers.values(values, columns)}
        ) AS x(tx_hash, log_index, batch_index, taker, fill_source_id, aggregator_source_id)
        WHERE fill_events_2.tx_hash = x.tx_hash::BYTEA
          AND fill_events_2.log_index = x.log_index::INT
          AND fill_events_2.batch_index = x.batch_index::INT
      `
    );
  }

  console.log("Done");
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import _ from "lodash";
import { redb } from "@/common/db";
import * as rarityQueue from "@/jobs/collection-updates/rarity-queue";

const main = async () => {
  const limit = 5000;
  let keepIterate = true;
  let lastId = "";

  while (keepIterate) {
    let idFilter = "";
    if (lastId != "") {
      console.log(`lastId = ${lastId}`);
      idFilter = `WHERE id > '${lastId}'`;
    }

    const query = `
      SELECT id
      FROM collections
      ${idFilter}
      ORDER BY id ASC
      LIMIT ${limit}
    `;

    const collections = await redb.manyOrNone(query);
    const ids = _.map(collections, (collection) => collection.id);
    await rarityQueue.addToQueue(ids);

    if (_.size(collections) < limit) {
      keepIterate = false;
    } else {
      lastId = _.last(collections).id;
    }
  }
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import _ from "lodash";
import { redb } from "@/common/db";
import * as collectionUpdatesMetadata from "@/jobs/collection-updates/metadata-queue";
import { fromBuffer } from "@/common/utils";

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
      SELECT id, contract, community
      FROM collections
      ${idFilter}
      ORDER BY id ASC
      LIMIT ${limit}
    `;

    const collections = await redb.manyOrNone(query);
    const infos = _.map(collections, (collection) => ({
      collectionId: collection.id,
      tokenId: "1",
      contract: fromBuffer(collection.contract),
      community: collection.community,
    }));

    await collectionUpdatesMetadata.addToQueueBulk(infos);

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

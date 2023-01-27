/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { idb } from "@/common/db";

const main = async () => {
  const limit = 2000;
  let iterations = 0;
  let result;
  const collections = [
    "0x112895a889ba439ffec427fbef499b4462376546",
    "0x112895a889ba439ffec427fbef499b4462376546:soundxyz-e025ccfb-f974-4bb3-acee-312aa8375c12",
  ];

  for (const collection of collections) {
    // Update the activities
    const updateActivitiesQuery = `
      WITH x AS (
        SELECT id, contract, token_id
        FROM activities
        WHERE collection_id = $/collection/
        LIMIT ${limit}
      )
      
      UPDATE activities
      SET collection_id = (
        SELECT collection_id
        FROM tokens
        WHERE contract = x.contract
        AND token_id = x.token_id
      )
      FROM x
      WHERE activities.id = x.id
      RETURNING 1
    `;

    do {
      result = await idb.manyOrNone(updateActivitiesQuery, { collection });
      ++iterations;
      console.log(`activities updated ${iterations * limit}`);
    } while (result.length > 0);
    console.log(`activities updated for ${collection}`);

    // Update the user activities
    const updateUserActivitiesQuery = `
      WITH x AS (
        SELECT id, contract, token_id
        FROM user_activities
        WHERE collection_id = $/collection/
        LIMIT ${limit}
      )
      
      UPDATE user_activities
      SET collection_id = (
        SELECT collection_id
        FROM tokens
        WHERE contract = x.contract
        AND token_id = x.token_id
      )
      FROM x
      WHERE user_activities.id = x.id
      RETURNING 1
    `;

    iterations = 0;
    do {
      result = await idb.manyOrNone(updateUserActivitiesQuery, { collection });
      ++iterations;
      console.log(`user_activities updated ${iterations * limit}`);
    } while (result.length > 0);
    console.log(`user_activities updated for ${collection}`);

    // // Clean the attributes
    // const cleanAttributesQuery = `
    //   WITH x AS (
    //     SELECT id
    //     FROM attributes
    //     WHERE collection_id = $/collection/
    //     LIMIT ${limit}
    //   )
    //
    //   DELETE FROM attributes
    //   WHERE attributes.id IN (SELECT id FROM x)
    //   RETURNING 1
    // `;
    //
    // iterations = 0;
    // do {
    //   result = await idb.manyOrNone(cleanAttributesQuery, { collection });
    //   ++iterations;
    //   console.log(`attributes updated ${iterations * limit}`);
    // } while (result.length > 0);
    // console.log(`attributes updated for ${collection}`);
    //
    // // Clean the attribute keys
    // const cleanAttributeKeysQuery = `
    //   WITH x AS (
    //     SELECT id
    //     FROM attribute_keys
    //     WHERE collection_id = $/collection/
    //     LIMIT ${limit}
    //   )
    //
    //   DELETE FROM attribute_keys
    //   WHERE attribute_keys.id IN (SELECT id FROM x)
    //   RETURNING 1
    // `;
    //
    // iterations = 0;
    // do {
    //   result = await idb.manyOrNone(cleanAttributeKeysQuery, { collection });
    //   ++iterations;
    //   console.log(`attribute_keys updated ${iterations * limit}`);
    // } while (result.length == limit);
    // console.log(`attribute_keys updated for ${collection}`);
    //
    // // Clean the token sets
    // const cleanTokenSetsQuery = `
    //   WITH x AS (
    //     SELECT id
    //     FROM token_sets
    //     WHERE collection_id = $/collection/
    //     LIMIT ${limit}
    //   )
    //
    //   DELETE FROM token_sets
    //   WHERE token_sets.id IN (SELECT id FROM x)
    //   RETURNING 1
    // `;
    //
    // iterations = 0;
    // do {
    //   result = await idb.manyOrNone(cleanTokenSetsQuery, { collection });
    //   ++iterations;
    //   console.log(`token_sets updated ${iterations * limit}`);
    // } while (result.length == limit);
    // console.log(`token_sets updated for ${collection}`);
    //
    // // Clean the collection
    // const cleanCollectionsQuery = `
    //   DELETE FROM collections
    //   WHERE id = $/collection/
    // `;
    //
    // await idb.none(cleanCollectionsQuery, { collection });
  }
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

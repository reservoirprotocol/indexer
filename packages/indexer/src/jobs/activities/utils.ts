import crypto from "crypto";
import { redb } from "@/common/db";
import { Tokens } from "@/models/tokens";
import { Attributes } from "@/models/attributes";
import { Collections } from "@/models/collections";

export function getActivityHash(...params: string[]) {
  return crypto
    .createHash("sha256")
    .update(`${params.join("")}`)
    .digest("hex");
}

export async function getBidInfoByOrderId(orderId: string) {
  let tokenId;
  let collectionId;

  const tokenSetByOrderIdResult = await redb.oneOrNone(
    `
                SELECT
                  ts.id,
                  ts.attribute_id,
                  ts.collection_id
                FROM orders
                JOIN token_sets ts
                  ON orders.token_set_id = ts.id
                WHERE orders.id = $/orderId/
                LIMIT 1
            `,
    {
      orderId: orderId,
    }
  );

  if (tokenSetByOrderIdResult.id.startsWith("token:")) {
    let contract;

    [, contract, tokenId] = tokenSetByOrderIdResult.id.split(":");

    collectionId = await Tokens.getCollectionId(contract, tokenId);
  } else if (tokenSetByOrderIdResult.id.startsWith("list:")) {
    if (tokenSetByOrderIdResult.attribute_id) {
      const attribute = await Attributes.getById(tokenSetByOrderIdResult.attribute_id);
      collectionId = attribute?.collectionId;
    } else {
      collectionId = tokenSetByOrderIdResult.collection_id;
    }
  } else if (tokenSetByOrderIdResult.id.startsWith("range:")) {
    const collection = await Collections.getByTokenSetId(tokenSetByOrderIdResult.id);
    collectionId = collection?.id;
  } else {
    [, collectionId] = tokenSetByOrderIdResult.id.split(":");
  }

  return [collectionId, tokenId, tokenSetByOrderIdResult.attribute_id];
}

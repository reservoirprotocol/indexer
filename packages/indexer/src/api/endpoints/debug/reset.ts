/* eslint-disable @typescript-eslint/no-explicit-any */

import { RouteOptions } from "@hapi/hapi";
import { idb } from "@/common/db";

export const resetOptions: RouteOptions = {
  description: "Reset Databse",
  tags: ["debug"],
  plugins: {
    "hapi-swagger": {
      deprecated: true,
    },
  },
  validate: {},
  handler: async () => {
    const result = await Promise.all([
      idb.oneOrNone(`DELETE FROM nonce_cancel_events`),
      idb.oneOrNone(`DELETE FROM orders`),
      idb.oneOrNone(`DELETE FROM bulk_cancel_events`),
      idb.oneOrNone(`DELETE FROM looksrare_v2_subset_nonce_cancel_events`),
    ]);
    return result;
  },
};

/* eslint-disable @typescript-eslint/no-explicit-any */

import axios from "axios";

const indexUrl = process.env.INDEXER_URL || "http://127.0.0.1:3000";

export async function doEventParsing(tx: string, skipProcessing = true) {
  const { data } = await axios.get(`${indexUrl}/debug/event-parsing`, {
    params: {
      tx,
      skipProcessing,
    },
  });
  return data;
}

export async function doOrderSaving(postData: any) {
  const { data } = await axios.post(`${indexUrl}/debug/order-saving`, postData);
  return data;
}

export async function getOrder(orderId: string) {
  const { data } = await axios.get(`${indexUrl}/debug/get-order`, {
    params: {
      orderId,
    },
  });
  return data;
}

export async function executeBuyV7(payload: any) {
  const { data } = await axios.post(`${indexUrl}/execute/buy/v7`, payload);
  return data;
}

export async function executeSellV7(payload: any) {
  const { data } = await axios.post(`${indexUrl}/execute/sell/v7`, payload);
  return data;
}

export async function reset() {
  const { data } = await axios.get(`${indexUrl}/debug/reset`);
  return data;
}

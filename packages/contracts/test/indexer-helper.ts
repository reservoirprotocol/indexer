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
  const { data } = await axios.post(`${indexUrl}/debug/order-saving`, postData, {
    validateStatus: () => true,
  });
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
  const { data } = await axios.post(`${indexUrl}/execute/buy/v7`, payload, {
    validateStatus: () => true,
  });
  return data;
}

export async function executeSellV7(payload: any) {
  const { data } = await axios.post(`${indexUrl}/execute/sell/v7`, payload, {
    validateStatus: () => true,
  });
  return data;
}

export async function executeBidV5(payload: any) {
  const { data } = await axios.post(`${indexUrl}/execute/bid/v5`, payload, {
    validateStatus: () => true,
  });
  return data;
}

export async function savePreSignature(signature: string, id: string) {
  const { data } = await axios.post(`${indexUrl}/execute/pre-signature/v1?signature=${signature}`, {
    id
  }, {
    validateStatus: () => true,
  });
  return data;
}

export async function callStepAPI(endpoint: string, signature: string, payload: string) {
  const { data } = await axios.post(`${indexUrl}${endpoint}?signature=${signature}`, payload, {
    validateStatus: () => true,
  });
  return data;
}

export async function reset() {
  const { data } = await axios.get(`${indexUrl}/debug/reset`);
  return data;
}

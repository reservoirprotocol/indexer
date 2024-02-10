import { PendingToken } from "@/utils/pending-txs/types";

import * as blur from "@/utils/pending-txs/parser/blur";
import * as paymentProcessorV2 from "@/utils/pending-txs/parser/payment-processor-v2";
import * as seaport from "@/utils/pending-txs/parser/seaport";

export const parseTokensFromCalldata = async (calldata: string): Promise<PendingToken[]> => {
  const [blurResults, ppv2Results, seaportResults] = await Promise.all([
    blur.parseTokensFromCalldata(calldata),
    paymentProcessorV2.parseTokensFromCalldata(calldata),
    seaport.parseTokensFromCalldata(calldata),
  ]);
  return [...blurResults, ...ppv2Results, ...seaportResults];
};

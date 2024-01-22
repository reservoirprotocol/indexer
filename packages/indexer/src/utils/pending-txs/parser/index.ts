import { PendingToken } from "@/utils/pending-txs/types";

import * as paymentProcessorV2 from "@/utils/pending-txs/parser/payment-processor-v2";
import * as seaport from "@/utils/pending-txs/parser/seaport";

export const parseTokensFromCalldata = async (calldata: string): Promise<PendingToken[]> => {
  const ppv2Results = await paymentProcessorV2.parseTokensFromCalldata(calldata);
  const seaportResults = await seaport.parseTokensFromCalldata(calldata);
  return ppv2Results.concat(seaportResults);
};

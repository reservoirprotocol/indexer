import { Interface } from "@ethersproject/abi";
import { searchForCall } from "@georgeroman/evm-tx-simulator";

import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as utils from "@/events-sync/utils";
import { getUSDAndNativePrices } from "@/utils/prices";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  // Handle the events
  for (const { subKind, baseEventParams, log } of events) {
    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "tofu-inventory-update": {
        const parsedLog = eventData.abi.parseLog(log);
        const orderId = parsedLog.args["id"].toString();
        const inventory = parsedLog.args["inventory"];
        const maker = inventory.seller.toLowerCase();
        let taker = inventory.buyer.toLowerCase();
        const currency = inventory.currency.toLowerCase();
        const netPrice = inventory.netPrice.toString();

        const txTrace = await utils.fetchTransactionTrace(baseEventParams.txHash);
        if (!txTrace) {
          // Skip any failed attempts to get the trace
          break;
        }

        const iface = new Interface([
          `function run(
            tuple(
              address user,
              tuple(
                address token,
                uint256 tokenId,
                uint256 amount,
                uint8 kind,
                bytes mintData
              )[] bundle,
              address currency,
              uint256 price,
              uint256 deadline,
              bytes32 salt,
              uint8 kind
            ) intent,
            tuple(
              bytes32 intentionHash,
              address signer,
              uint256 txDeadline,
              bytes32 salt,
              uint256 id,
              uint8 opcode,
              address caller,
              address currency,
              uint256 price,
              uint256 incentiveRate,
              tuple(
                uint256[] coupons,
                uint256 feeRate,
                uint256 royaltyRate,
                uint256 buyerCashbackRate,
                address feeAddress,
                address royaltyAddress
              ) settlement,
              tuple(
                address token,
                uint256 tokenId,
                uint256 amount,
                uint8 kind,
                bytes mintData
              )[] bundle,
              uint256 deadline
            ) detail,
            bytes sigIntent,
            bytes sigDetail
          )`,
        ]);
        const exchangeCallTrace = searchForCall(
          txTrace.calls,
          {
            to: baseEventParams.address,
            type: "CALL",
            sigHashes: [iface.getSighash("run")],
          },
          0
        );

        if (!exchangeCallTrace) {
          break;
        }

        const result = iface.decodeFunctionData("run", exchangeCallTrace.input);
        const opcode = result.detail.opcode;
        const nftTokens = result.intent.bundle;

        // We don't support bundles at the moment
        if (nftTokens.length !== 1) {
          break;
        }

        const contract = nftTokens[0].token.toLowerCase();
        const tokenId = nftTokens[0].tokenId.toString();
        const amount = nftTokens[0].amount.toString();

        // 1 - complete sell (off-chain)
        // 2 - complete buy (off-chain)
        // 4 - complete KIND_BUY
        // 8 - complete auction (by anyone)
        // 9 - accept auction in an early stage (by seller)
        if (![1, 2, 4, 8, 9].includes(opcode)) {
          break;
        }

        const orderSide = [1, 8, 9].includes(opcode) ? "sell" : "buy";

        if (!taker || !tokenId || !contract || !amount) {
          break;
        }

        // Handle: prices
        const priceData = await getUSDAndNativePrices(
          currency,
          netPrice,
          baseEventParams.timestamp
        );

        // Handle: attribution
        const orderKind = "tofu-nft";
        const data = await utils.extractAttributionData(baseEventParams.txHash, orderKind, {
          orderId,
        });

        if (data.taker) {
          taker = data.taker;
        }

        if (!priceData.nativePrice) {
          // We must always have the native price
          break;
        }

        onChainData.fillEvents.push({
          orderKind,
          currency,
          orderSide,
          maker,
          taker,
          price: priceData.nativePrice,
          currencyPrice: netPrice,
          usdPrice: priceData.usdPrice,
          contract,
          tokenId,
          amount,
          orderSourceId: data.orderSource?.id,
          aggregatorSourceId: data.aggregatorSource?.id,
          fillSourceId: data.fillSource?.id,
          baseEventParams,
        });

        onChainData.fillInfos.push({
          context: `tofu-${contract}-${tokenId}-${orderId}-${baseEventParams.txHash}`,
          orderSide,
          contract,
          tokenId,
          amount,
          price: priceData.nativePrice,
          timestamp: baseEventParams.timestamp,
          maker,
          taker,
        });

        break;
      }
    }
  }
};

import { Interface } from "@ethersproject/abi";
import { AddressZero } from "@ethersproject/constants";
import * as Sdk from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as utils from "@/events-sync/utils";
import * as cryptopunks from "@/orderbook/orders/cryptopunks";
import { getUSDAndNativePrices } from "@/utils/prices";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  // Keep track of any Cryptopunks transfers (for working around a contract bug)
  const transfers: {
    to: string;
    txHash: string;
  }[] = [];

  // Handle the events
  for (const { subKind, baseEventParams, log } of events) {
    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "cryptopunks-punk-offered": {
        const parsedLog = eventData.abi.parseLog(log);
        const tokenId = parsedLog.args["punkIndex"].toString();
        const price = parsedLog.args["minValue"].toString();
        const taker = parsedLog.args["toAddress"].toLowerCase();

        onChainData.orders.push({
          kind: "cryptopunks",
          info: {
            orderParams: {
              maker: (await utils.fetchTransaction(baseEventParams.txHash)).from.toLowerCase(),
              side: "sell",
              tokenId,
              price,
              taker: taker !== AddressZero ? taker : undefined,
              txHash: baseEventParams.txHash,
              txTimestamp: baseEventParams.timestamp,
              txBlock: baseEventParams.block,
              logIndex: baseEventParams.logIndex,
              batchIndex: baseEventParams.batchIndex,
            },
            metadata: {},
          },
        });

        break;
      }

      case "cryptopunks-punk-no-longer-for-sale": {
        const parsedLog = eventData.abi.parseLog(log);
        const tokenId = parsedLog.args["punkIndex"].toString();

        const orderId = cryptopunks.getOrderId(tokenId);

        onChainData.cancelEventsOnChain.push({
          orderKind: "cryptopunks",
          orderId,
          baseEventParams,
        });

        onChainData.orderInfos.push({
          context: `cancelled-${orderId}-${baseEventParams.txHash}`,
          id: orderId,
          trigger: {
            kind: "cancel",
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
            logIndex: baseEventParams.logIndex,
            batchIndex: baseEventParams.batchIndex,
            blockHash: baseEventParams.blockHash,
          },
        });

        break;
      }

      case "cryptopunks-punk-bought": {
        const { args } = eventData.abi.parseLog(log);
        const tokenId = args["punkIndex"].toString();
        let value = args["value"].toString();
        const fromAddress = args["fromAddress"].toLowerCase();
        let toAddress = args["toAddress"].toLowerCase();

        // Due to an upstream issue with the Punks contract, the `PunkBought`
        // event is emitted with zeroed `toAddress` and `value` fields when a
        // bid acceptance transaction is triggered. See the following issue:
        // https://github.com/larvalabs/cryptopunks/issues/19

        // To work around this, we get the correct `toAddress` from the most
        // recent `Transfer` event which includes the correct taker
        if (transfers.length && transfers[transfers.length - 1].txHash === baseEventParams.txHash) {
          toAddress = transfers[transfers.length - 1].to;
        }

        // To get the correct price that the bid was settled at we have to
        // parse the transaction's calldata and extract the `minPrice` arg
        // where applicable (if the transaction was a bid acceptance one)
        const tx = await utils.fetchTransaction(baseEventParams.txHash);
        const iface = new Interface(["function acceptBidForPunk(uint punkIndex, uint minPrice)"]);
        try {
          const result = iface.decodeFunctionData("acceptBidForPunk", tx.data);
          value = result.minPrice.toString();
        } catch {
          // Skip any errors
        }

        if (value === "0") {
          // Skip if the sell was for a price of zero (since in that case it was probably
          // not even a sell, but a hacky way of setting an approval for Cryptopunks)
          break;
        }

        const orderSide = toAddress === AddressZero ? "buy" : "sell";
        const maker = orderSide === "sell" ? fromAddress : toAddress;
        let taker = orderSide === "sell" ? toAddress : fromAddress;

        // Handle: attribution

        const orderKind = "cryptopunks";
        const orderId = cryptopunks.getOrderId(tokenId);
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind,
          { orderId }
        );
        if (attributionData.taker) {
          taker = attributionData.taker;
        }

        // Handle: prices
        const priceData = await getUSDAndNativePrices(
          Sdk.Common.Addresses.Native[config.chainId],
          value,
          baseEventParams.timestamp
        );
        if (!priceData.nativePrice) {
          // We must always have the native price
          break;
        }

        onChainData.nftTransferEvents.push({
          kind: "cryptopunks",
          from: fromAddress,
          to: toAddress,
          tokenId,
          amount: "1",
          baseEventParams,
        });

        onChainData.fillEventsOnChain.push({
          orderId,
          orderKind,
          orderSide,
          maker,
          taker,
          price: priceData.nativePrice,
          currencyPrice: value,
          usdPrice: priceData.usdPrice,
          currency: Sdk.Common.Addresses.Native[config.chainId],
          contract: baseEventParams.address?.toLowerCase(),
          tokenId,
          amount: "1",
          orderSourceId: attributionData.orderSource?.id,
          aggregatorSourceId: attributionData.aggregatorSource?.id,
          fillSourceId: attributionData.fillSource?.id,
          baseEventParams,
        });

        onChainData.orderInfos.push({
          context: `filled-${orderId}-${baseEventParams.txHash}`,
          id: orderId,
          trigger: {
            kind: "sale",
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
          },
        });

        onChainData.fillInfos.push({
          context: orderId,
          orderId: orderId,
          orderSide: "sell",
          contract: Sdk.CryptoPunks.Addresses.Exchange[config.chainId],
          tokenId,
          amount: "1",
          price: priceData.nativePrice,
          timestamp: baseEventParams.timestamp,
          maker,
          taker,
        });

        break;
      }

      case "cryptopunks-punk-transfer": {
        const { args } = eventData.abi.parseLog(log);
        const from = args["from"].toLowerCase();
        const to = args["to"].toLowerCase();
        const tokenId = args["punkIndex"].toString();

        onChainData.nftTransferEvents.push({
          kind: "cryptopunks",
          from,
          to,
          tokenId,
          amount: "1",
          baseEventParams,
        });

        break;
      }

      case "cryptopunks-assign": {
        const { args } = eventData.abi.parseLog(log);
        const to = args["to"].toLowerCase();
        const tokenId = args["punkIndex"].toString();

        onChainData.nftTransferEvents.push({
          kind: "cryptopunks",
          from: AddressZero,
          to,
          tokenId,
          amount: "1",
          baseEventParams,
        });

        onChainData.mintInfos.push({
          contract: baseEventParams.address,
          tokenId,
          mintedTimestamp: baseEventParams.timestamp,
          context: "cryptopunks",
        });

        break;
      }

      case "cryptopunks-transfer": {
        const { args } = eventData.abi.parseLog(log);
        const to = args["to"].toLowerCase();

        transfers.push({
          to,
          txHash: baseEventParams.txHash,
        });

        break;
      }
    }
  }
};

import { Interface, defaultAbiCoder } from "@ethersproject/abi";
import { Log } from "@ethersproject/abstract-provider";
import { AddressZero } from "@ethersproject/constants";
import { searchForCall } from "@georgeroman/evm-tx-simulator";
import * as Sdk from "@reservoir0x/sdk";

import { bn } from "@/common/utils";
import { config } from "@/config/index";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import { getERC20Transfer } from "@/events-sync/handlers/utils/erc20";
import * as utils from "@/events-sync/utils";
import { getUSDAndNativePrices } from "@/utils/prices";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  // Keep track of all events within the currently processing transaction
  let currentTx: string | undefined;
  let currentTxLogs: Log[] = [];
  const eventsLog = {
    matchOrders: new Map<string, number>(),
    directPurchase: new Map<string, number>(),
    directAcceptBid: new Map<string, number>(),
  };

  // Handle the events
  for (const { subKind, baseEventParams, log } of events) {
    if (currentTx !== baseEventParams.txHash) {
      currentTx = baseEventParams.txHash;
      currentTxLogs = [];
    }
    currentTxLogs.push(log);

    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "rarible-cancel": {
        const { args } = eventData.abi.parseLog(log);
        const orderId = args["hash"].toLowerCase();

        onChainData.cancelEvents.push({
          orderKind: "rarible",
          orderId,
          baseEventParams,
        });

        onChainData.orderInfos.push({
          context: `cancelled-${orderId}`,
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

      case "rarible-match": {
        const { args } = eventData.abi.parseLog(log);
        const leftHash = args["leftHash"].toLowerCase();
        const rightHash = args["rightHash"].toLowerCase();
        const newLeftFill = args["newLeftFill"].toString();
        const newRightFill = args["newRightFill"].toString();

        const ERC20 = "0x8ae85d84";
        const ETH = "0xaaaebeba";
        const ERC721 = "0x73ad2146";
        const ERC1155 = "0x973bb640";
        const COLLECTION = "0xf63c2825";

        const matchOrdersSigHash = "0xe99a3f80";
        const directPurchaseSigHash = "0x0d5f7d35";
        const directAcceptBidSigHash = "0x67d49a3b";

        const assetTypes = [ERC721, ERC1155, ERC20, ETH, COLLECTION];

        const orderKind = "rarible";
        let side: "sell" | "buy" = "sell";
        let taker = AddressZero;
        let currencyAssetType = "";
        let nftAssetType = "";
        let nftData = "";
        let maker = "";
        let paymentCurrency = "";
        let amount = "";
        let currencyPrice = "";
        let orderId = "";

        const txHash = baseEventParams.txHash;
        const address = baseEventParams.address;

        // Event data doesn't include full order information so we have to parse the calldata
        const txTrace = await utils.fetchTransactionTrace(txHash);
        if (!txTrace) {
          // Skip any failed attempts to get the trace
          break;
        }

        // Rarible has 3 fill functions: directPurchase, directAcceptBid and matchOrders.
        // Try to parse calldata as directPurchase
        try {
          const eventRank = eventsLog.directPurchase.get(`${txHash}-${address}`) ?? 0;

          const callTrace = searchForCall(
            txTrace.calls,
            {
              to: address,
              type: "CALL",
              sigHashes: [directPurchaseSigHash],
            },
            eventRank
          );

          if (callTrace) {
            const iface = new Interface([
              "function directPurchase(tuple(address sellOrderMaker, uint256 sellOrderNftAmount, bytes4 nftAssetClass, bytes nftData, uint256 sellOrderPaymentAmount, address paymentToken, uint256 sellOrderSalt, uint sellOrderStart, uint sellOrderEnd, bytes4 sellOrderDataType, bytes sellOrderData, bytes sellOrderSignature, uint256 buyOrderPaymentAmount, uint256 buyOrderNftAmount, bytes buyOrderData))",
            ]);
            const result = iface.decodeFunctionData("directPurchase", callTrace.input);
            orderId = leftHash;
            side = "sell";
            maker = result[0][0].toLowerCase();
            // taker will be overwritten in extractAttributionData step if router is used
            taker = callTrace.to.toLowerCase();
            nftAssetType = result[0][2];
            nftData = result[0][3];

            paymentCurrency = result[0][5].toLowerCase();
            if (paymentCurrency === Sdk.Common.Addresses.Native[config.chainId]) {
              currencyAssetType = ETH;
            } else {
              currencyAssetType = ERC20;
            }

            currencyPrice = newLeftFill;
            amount = newRightFill;

            eventsLog.directPurchase.set(`${txHash}-${address}`, eventRank + 1);
          }
        } catch {
          // tx data doesn't match directPurchase
        }

        // Try to parse calldata as directAcceptBid
        try {
          const eventRank = eventsLog.directAcceptBid.get(`${txHash}-${address}`) ?? 0;

          const callTrace = searchForCall(
            txTrace.calls,
            {
              to: address,
              type: "CALL",
              sigHashes: [directAcceptBidSigHash],
            },
            eventRank
          );

          if (callTrace) {
            const iface = new Interface([
              "function directAcceptBid(tuple(address bidMaker, uint256 bidNftAmount, bytes4 nftAssetClass, bytes nftData, uint256 bidPaymentAmount, address paymentToken, uint256 bidSalt, uint bidStart, uint bidEnd, bytes4 bidDataType, bytes bidData, bytes bidSignature, uint256 sellOrderPaymentAmount, uint256 sellOrderNftAmount, bytes sellOrderData) )",
            ]);
            const result = iface.decodeFunctionData("directAcceptBid", callTrace.input);
            orderId = rightHash;

            side = "buy";
            maker = result[0][0].toLowerCase();
            // taker will be overwritten in extractAttributionData step if router is used
            taker = callTrace.from.toLowerCase();
            nftAssetType = result[0][2];
            nftData = result[0][3];

            paymentCurrency = result[0][5].toLowerCase();
            if (paymentCurrency === Sdk.Common.Addresses.Native[config.chainId]) {
              currencyAssetType = ETH;
            } else {
              currencyAssetType = ERC20;
            }

            currencyPrice = newLeftFill;
            amount = newRightFill;

            eventsLog.directAcceptBid.set(`${txHash}-${address}`, eventRank + 1);
          }
        } catch {
          // tx data doesn't match directAcceptBid
        }

        // Try to parse calldata as matchOrders
        try {
          const eventRank = eventsLog.matchOrders.get(`${txHash}-${address}`) ?? 0;
          const callTrace = searchForCall(
            txTrace.calls,
            {
              to: address,
              type: "CALL",
              sigHashes: [matchOrdersSigHash],
            },
            eventRank
          );

          if (callTrace) {
            const iface = new Interface([
              "function matchOrders(tuple(address maker, tuple(tuple(bytes4 assetClass, bytes data) assetType, uint256 value) makeAsset, address taker, tuple(tuple(bytes4 assetClass, bytes data) assetType, uint256 value) takeAsset, uint256 salt, uint256 start, uint256 end, bytes4 dataType, bytes data) orderLeft, bytes signatureLeft, tuple(address maker, tuple(tuple(bytes4 assetClass, bytes data) assetType, uint256 value) makeAsset, address taker, tuple(tuple(bytes4 assetClass, bytes data) assetType, uint256 value) takeAsset, uint256 salt, uint256 start, uint256 end, bytes4 dataType, bytes data) orderRight, bytes signatureRight)",
            ]);
            const result = iface.decodeFunctionData("matchOrders", callTrace.input);
            const orderLeft = result.orderLeft;
            const orderRight = result.orderRight;
            const leftMakeAsset = orderLeft.makeAsset;
            const rightMakeAsset = orderLeft.takeAsset;

            maker = orderLeft.maker.toLowerCase();
            // taker will be overwritten in extractAttributionData step if router is used
            taker = orderRight.maker.toLowerCase();
            side = [ERC721, ERC1155].includes(leftMakeAsset.assetType.assetClass) ? "sell" : "buy";

            const nftAsset = side === "buy" ? rightMakeAsset : leftMakeAsset;
            const currencyAsset = side === "buy" ? leftMakeAsset : rightMakeAsset;

            orderId = leftHash;
            nftAssetType = nftAsset.assetType.assetClass;
            currencyAssetType = currencyAsset.assetType.assetClass;
            switch (nftAssetType) {
              case COLLECTION:
                // Left order doesn't contain token id. We need to use the right order
                nftData = orderRight.makeAsset.assetType.data;
                break;
              case ERC721:
              case ERC1155:
                nftData = nftAsset.assetType.data;
                break;
              default:
                throw Error("Unsupported asset type");
            }

            if (currencyAssetType === ETH) {
              paymentCurrency = Sdk.Common.Addresses.Native[config.chainId];
            } else if (currencyAssetType === ERC20) {
              const decodedCurrencyAsset = defaultAbiCoder.decode(
                ["(address token)"],
                currencyAsset.assetType.data
              );
              paymentCurrency = decodedCurrencyAsset[0][0].toLowerCase();
            }

            // Match order has amount in newLeftFill when it's a buy order and amount in newRightFill when it's sell order
            amount = side === "buy" ? newLeftFill : newRightFill;
            currencyPrice = side === "buy" ? newRightFill : newLeftFill;

            eventsLog.matchOrders.set(`${txHash}-${address}`, eventRank + 1);
          }
        } catch {
          // tx data doesn't match matchOrders
        }

        // Exclude orders with exotic asset types
        if (!assetTypes.includes(nftAssetType) || !assetTypes.includes(currencyAssetType)) {
          break;
        }

        // Handle: attribution
        const data = await utils.extractAttributionData(baseEventParams.txHash, orderKind, {
          orderId,
        });
        if (data.taker) {
          taker = data.taker;
        }

        // Handle: prices
        let currency: string;
        if (currencyAssetType === ETH) {
          currency = Sdk.Common.Addresses.Native[config.chainId];
        } else if (currencyAssetType === ERC20) {
          currency = paymentCurrency;
        } else {
          break;
        }

        const decodedNftAsset = defaultAbiCoder.decode(["(address token, uint tokenId)"], nftData);
        const contract = decodedNftAsset[0][0].toLowerCase();
        const tokenId = decodedNftAsset[0][1].toString();

        currencyPrice = bn(currencyPrice).div(amount).toString();

        const prices = await getUSDAndNativePrices(
          currency.toLowerCase(),
          currencyPrice,
          baseEventParams.timestamp
        );
        if (!prices.nativePrice) {
          // We must always have the native price
          break;
        }

        onChainData.fillEventsPartial.push({
          orderKind,
          orderId,
          orderSide: side,
          maker,
          taker,
          price: prices.nativePrice,
          currency,
          currencyPrice,
          usdPrice: prices.usdPrice,
          contract,
          tokenId,
          amount,
          orderSourceId: data.orderSource?.id,
          aggregatorSourceId: data.aggregatorSource?.id,
          fillSourceId: data.fillSource?.id,
          baseEventParams,
        });

        onChainData.fillInfos.push({
          context: `${orderId}-${baseEventParams.txHash}`,
          orderId,
          orderSide: side,
          contract,
          tokenId,
          amount,
          price: prices.nativePrice,
          timestamp: baseEventParams.timestamp,
          maker,
          taker,
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

        // If an ERC20 transfer occured in the same transaction as a sale
        // then we need resync the maker's ERC20 approval to the exchange
        const erc20 = getERC20Transfer(currentTxLogs);
        if (erc20) {
          onChainData.makerInfos.push({
            context: `${baseEventParams.txHash}-buy-approval`,
            maker,
            trigger: {
              kind: "approval-change",
              txHash: baseEventParams.txHash,
              txTimestamp: baseEventParams.timestamp,
            },
            data: {
              kind: "buy-approval",
              contract: erc20,
              orderKind: "rarible",
            },
          });
        }

        break;
      }

      case "rarible-buy-v1": {
        const { args } = eventData.abi.parseLog(log);
        const tokenContract = args["sellToken"];
        const tokenId = args["sellTokenId"];
        const maker = args["owner"];
        const currency = args["buyToken"];
        let currencyPrice = args["buyValue"];
        let taker = args["buyer"];
        const amount = args["amount"]; // amount bought

        const orderKind = "rarible";
        const side = "sell";

        currencyPrice = bn(currencyPrice).div(amount).toString();

        const prices = await getUSDAndNativePrices(
          currency.toLowerCase(),
          currencyPrice,
          baseEventParams.timestamp
        );
        if (!prices.nativePrice) {
          // We must always have the native price
          break;
        }

        const data = await utils.extractAttributionData(baseEventParams.txHash, orderKind);
        if (data.taker) {
          taker = data.taker;
        }

        onChainData.fillEventsPartial.push({
          orderKind,
          orderSide: side,
          maker,
          taker,
          price: prices.nativePrice,
          currency,
          currencyPrice,
          usdPrice: prices.usdPrice,
          contract: tokenContract,
          tokenId: tokenId.toString(),
          amount: amount.toString(),
          orderSourceId: data.orderSource?.id,
          aggregatorSourceId: data.aggregatorSource?.id,
          fillSourceId: data.fillSource?.id,
          baseEventParams,
        });

        onChainData.fillInfos.push({
          context: `rarible-v1-${tokenContract}-${tokenId}-${baseEventParams.txHash}`,
          orderSide: side,
          contract: tokenContract,
          tokenId: tokenId.toString(),
          amount: amount.toString(),
          price: prices.nativePrice,
          timestamp: baseEventParams.timestamp,
          maker,
          taker,
        });

        break;
      }

      case "rarible-match-v2": {
        const { args } = eventData.abi.parseLog(log);
        const leftHash = args["leftHash"].toLowerCase();
        const leftMaker = args["leftMaker"].toLowerCase();
        const rightMaker = args["rightMaker"].toLowerCase();
        const newLeftFill = args["newLeftFill"].toString();
        const newRightFill = args["newRightFill"].toString();
        const leftAsset = args["leftAsset"];
        const rightAsset = args["rightAsset"];

        const ERC20 = "0x8ae85d84";
        const ETH = "0xaaaebeba";
        const ERC721 = "0x73ad2146";
        const ERC1155 = "0x973bb640";

        const assetTypes = [ERC721, ERC1155, ERC20, ETH];

        // Exclude orders with exotic asset types
        if (
          !assetTypes.includes(leftAsset.assetClass) ||
          !assetTypes.includes(rightAsset.assetClass)
        ) {
          break;
        }

        // Assume the left order is the maker's order
        const side = [ERC721, ERC1155].includes(leftAsset.assetClass) ? "sell" : "buy";

        const currencyAsset = side === "sell" ? rightAsset : leftAsset;
        const nftAsset = side === "sell" ? leftAsset : rightAsset;

        let currency: string;
        if (currencyAsset.assetClass === ETH) {
          currency = Sdk.Common.Addresses.Native[config.chainId];
        } else if (currencyAsset.assetClass === ERC20) {
          const decodedCurrencyAsset = defaultAbiCoder.decode(
            ["(address token)"],
            currencyAsset.data
          );
          currency = decodedCurrencyAsset[0][0];
        } else {
          break;
        }

        const decodedNftAsset = defaultAbiCoder.decode(
          ["(address token, uint tokenId)"],
          nftAsset.data
        );

        const contract = decodedNftAsset[0][0].toLowerCase();
        const tokenId = decodedNftAsset[0][1].toString();

        let currencyPrice = side === "sell" ? newLeftFill : newRightFill;
        const amount = side === "sell" ? newRightFill : newLeftFill;
        currencyPrice = bn(currencyPrice).div(amount).toString();

        const prices = await getUSDAndNativePrices(
          currency,
          currencyPrice,
          baseEventParams.timestamp
        );
        if (!prices.nativePrice) {
          // We must always have the native price
          break;
        }

        const orderKind = "rarible";
        let taker = rightMaker;

        // Handle attribution
        const data = await utils.extractAttributionData(baseEventParams.txHash, orderKind);

        if (data.taker) {
          taker = data.taker;
        }

        onChainData.fillEventsPartial.push({
          orderKind,
          orderId: leftHash,
          orderSide: side,
          maker: leftMaker,
          taker,
          price: prices.nativePrice,
          currency,
          currencyPrice,
          usdPrice: prices.usdPrice,
          contract,
          tokenId,
          amount,
          orderSourceId: data.orderSource?.id,
          aggregatorSourceId: data.aggregatorSource?.id,
          fillSourceId: data.fillSource?.id,
          baseEventParams,
        });

        onChainData.fillInfos.push({
          context: `${leftHash}-${baseEventParams.txHash}`,
          orderId: leftHash,
          orderSide: side,
          contract,
          tokenId,
          amount,
          price: prices.nativePrice,
          timestamp: baseEventParams.timestamp,
          maker: leftMaker,
          taker,
        });

        break;
      }
    }
  }
};

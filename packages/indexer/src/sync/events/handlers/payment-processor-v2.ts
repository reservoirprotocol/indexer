import { Result, defaultAbiCoder } from "@ethersproject/abi";
import { Log } from "@ethersproject/abstract-provider";
import { HashZero } from "@ethersproject/constants";
import { searchForCalls } from "@georgeroman/evm-tx-simulator";
import * as Sdk from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import { getERC20Transfer } from "@/events-sync/handlers/utils/erc20";
import * as utils from "@/events-sync/utils";
import * as commonHelpers from "@/orderbook/orders/common/helpers";
import * as paymentProcessorV2Utils from "@/utils/payment-processor-v2";
import { getUSDAndNativePrices } from "@/utils/prices";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  // Keep track of all events within the currently processing transaction
  let currentTx: string | undefined;
  let currentTxLogs: Log[] = [];

  // Handle the events
  for (const { subKind, baseEventParams, log } of events) {
    if (currentTx !== baseEventParams.txHash) {
      currentTx = baseEventParams.txHash;
      currentTxLogs = [];
    }
    currentTxLogs.push(log);

    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "payment-processor-v2-nonce-invalidated": {
        const parsedLog = eventData.abi.parseLog(log);
        const maker = parsedLog.args["account"].toLowerCase();
        const nonce = parsedLog.args["nonce"].toString();

        onChainData.nonceCancelEvents.push({
          orderKind: "payment-processor-v2",
          maker,
          nonce,
          baseEventParams,
        });

        break;
      }

      // TODO: The `orderDigest` is not the order id, we should handle this
      // case "payment-processor-v2-order-digest-invalidated": {
      //   const parsedLog = eventData.abi.parseLog(log);
      //   const orderId = parsedLog.args["orderDigest"].toLowerCase();

      //   onChainData.cancelEvents.push({
      //     orderKind: "payment-processor-v2",
      //     orderId,
      //     baseEventParams,
      //   });

      //   break;
      // }

      case "payment-processor-v2-master-nonce-invalidated": {
        const parsedLog = eventData.abi.parseLog(log);
        const maker = parsedLog.args["account"].toLowerCase();
        const newNonce = parsedLog.args["nonce"].toString();

        // Cancel all maker's orders
        onChainData.bulkCancelEvents.push({
          orderKind: "payment-processor-v2",
          maker,
          minNonce: newNonce,
          acrossAll: true,
          baseEventParams,
        });

        break;
      }

      case "payment-processor-v2-accept-offer-erc1155":
      case "payment-processor-v2-accept-offer-erc721":
      case "payment-processor-v2-buy-listing-erc1155":
      case "payment-processor-v2-buy-listing-erc721": {
        // Again the events are extremely poorly designed (order hash is not emitted)
        // so we have to rely on complex tricks (using call tracing) to associate the
        // sales to order ids

        const parsedLog = eventData.abi.parseLog(log);

        const txHash = baseEventParams.txHash;
        const tx = await utils.fetchTransaction(txHash);

        const exchange = new Sdk.PaymentProcessorV2.Exchange(config.chainId);
        const exchangeAddress = exchange.contract.address;

        const tokenIdOfEvent = parsedLog.args["tokenId"].toString();
        const tokenAddressOfEvent = parsedLog.args["tokenAddress"].toLowerCase();
        const tokenAmountOfEvent = (parsedLog.args["amount"] ?? 1).toString();
        const paymentCoinOfEvent = parsedLog.args["paymentCoin"].toLowerCase();

        const methods = [
          {
            selector: "0xc32dacae",
            name: "buyListing",
            abi: [
              "bytes32 domainSeparator",
              `(
                uint8 protocol,
                address maker,
                address beneficiary,
                address marketplace,
                address fallbackRoyaltyRecipient,
                address paymentMethod,
                address tokenAddress,
                uint256 tokenId,
                uint248 amount,
                uint256 itemPrice,
                uint256 nonce,
                uint256 expiration,
                uint256 marketplaceFeeNumerator,
                uint256 maxRoyaltyFeeNumerator,
                uint248 requestedFillAmount,
                uint248 minimumFillAmount
              ) saleDetails`,
              "(uint8 v, bytes32 r, bytes32 s) sellerSignature",
              "(address signer, address taker, uint256 expiration, uint8 v, bytes32 r, bytes32 s) cosignature",
              "(address recipient, uint256 amount) feeOnTop",
            ],
          },
          {
            selector: "0x08fdd68e",
            name: "acceptOffer",
            abi: [
              "bytes32 domainSeparator",
              "bool isCollectionLevelOffer",
              `(
                uint8 protocol,
                address maker,
                address beneficiary,
                address marketplace,
                address fallbackRoyaltyRecipient,
                address paymentMethod,
                address tokenAddress,
                uint256 tokenId,
                uint248 amount,
                uint256 itemPrice,
                uint256 nonce,
                uint256 expiration,
                uint256 marketplaceFeeNumerator,
                uint256 maxRoyaltyFeeNumerator,
                uint248 requestedFillAmount,
                uint248 minimumFillAmount
              ) saleDetails`,
              "(uint8 v, bytes32 r, bytes32 s) buyerSignature",
              "(bytes32 rootHash, bytes32[] proof) tokenSetProof",
              "(address signer, address taker, uint256 expiration, uint8 v, bytes32 r, bytes32 s) cosignature",
              "(address recipient, uint256 amount) feeOnTop",
            ],
          },
          {
            selector: "0x88d64fe8",
            name: "bulkAcceptOffers",
            abi: [
              "bytes32 domainSeparator",
              `(
                bool[] isCollectionLevelOfferArray,
                (
                  uint8 protocol,
                  address maker,
                  address beneficiary,
                  address marketplace,
                  address fallbackRoyaltyRecipient,
                  address paymentMethod,
                  address tokenAddress,
                  uint256 tokenId,
                  uint248 amount,
                  uint256 itemPrice,
                  uint256 nonce,
                  uint256 expiration,
                  uint256 marketplaceFeeNumerator,
                  uint256 maxRoyaltyFeeNumerator,
                  uint248 requestedFillAmount,
                  uint248 minimumFillAmount
                )[] saleDetailsArray,
                (uint8 v, bytes32 r, bytes32 s)[] buyerSignaturesArray,
                (bytes32 rootHash, bytes32[] proof)[] tokenSetProofsArray,
                (address signer, address taker, uint256 expiration, uint8 v, bytes32 r, bytes32 s)[] cosignaturesArray,
                (address recipient, uint256 amount)[] feesOnTopArray
              ) params`,
            ],
          },
          {
            selector: "0x863eb2d2",
            name: "bulkBuyListings",
            abi: [
              "bytes32 domainSeparator",
              "(uint8 protocol, address maker, address beneficiary, address marketplace, address fallbackRoyaltyRecipient, address paymentMethod, address tokenAddress, uint256 tokenId, uint248 amount, uint256 itemPrice, uint256 nonce, uint256 expiration, uint256 marketplaceFeeNumerator, uint256 maxRoyaltyFeeNumerator, uint248 requestedFillAmount, uint248 minimumFillAmount)[] saleDetailsArray",
              "(uint8 v, bytes32 r, bytes32 s)[] sellerSignatures",
              "(address signer, address taker, uint256 expiration, uint8 v, bytes32 r, bytes32 s)[] cosignatures",
              "(address recipient, uint256 amount)[] feesOnTop",
            ],
          },
          {
            selector: "0x96c3ae25",
            name: "sweepCollection",
            abi: [
              "bytes32 domainSeparator",
              "(address recipient, uint256 amount) feeOnTop",
              "(uint8 protocol, address tokenAddress, address paymentMethod, address beneficiary) sweepOrder",
              "(address maker, address marketplace, address fallbackRoyaltyRecipient, uint256 tokenId, uint248 amount, uint256 itemPrice, uint256 nonce, uint256 expiration, uint256 marketplaceFeeNumerator, uint256 maxRoyaltyFeeNumerator)[] items",
              "(uint8 v, bytes32 r, bytes32 s)[] signedSellOrders",
              "(address signer, address taker, uint256 expiration, uint8 v, bytes32 r, bytes32 s)[] cosignatures",
            ],
          },
        ];

        const relevantCalls: string[] = [];

        const txTrace = await utils.fetchTransactionTrace(txHash);
        if (txTrace) {
          try {
            const calls = searchForCalls(txTrace.calls, {
              to: exchangeAddress,
              type: "CALL",
              sigHashes: methods.map((c) => c.selector),
            });
            for (const call of calls) {
              relevantCalls.push(call.input ?? "0x");
            }
          } catch {
            relevantCalls.push(tx.data);
          }
        } else {
          relevantCalls.push(tx.data);
        }

        for (const relevantCalldata of relevantCalls) {
          const matchedMethod = methods.find((c) => relevantCalldata.includes(c.selector));
          if (!matchedMethod) {
            continue;
          }

          const args = exchange.contract.interface.decodeFunctionData(
            matchedMethod.name,
            relevantCalldata
          );

          const inputData = defaultAbiCoder.decode(matchedMethod.abi, args.data);
          let saleDetailsArray = [inputData.saleDetails];
          let saleSignatures = [inputData.buyerSignature || inputData.sellerSignature];
          let tokenSetProofs = [inputData.tokenSetProof];
          const isCollectionLevelOffer = inputData.isCollectionLevelOffer;

          if (matchedMethod.name === "sweepCollection") {
            const sweepOrder = inputData.sweepOrder;
            saleSignatures = inputData.signedSellOrders;
            saleDetailsArray = inputData.items.map((c: Result) => {
              return {
                protocol: sweepOrder.protocol,
                tokenAddress: sweepOrder.tokenAddress,
                paymentMethod: sweepOrder.paymentMethod,
                beneficiary: sweepOrder.beneficiary,
                maker: c.maker,
                itemPrice: c.itemPrice,
                tokenId: c.tokenId,
                amount: c.amount,
                marketplace: c.marketplace,
                marketplaceFeeNumerator: c.marketplaceFeeNumerator,
                maxRoyaltyFeeNumerator: c.maxRoyaltyFeeNumerator,
                expiration: c.expiration,
                nonce: c.nonce,
              };
            });
          } else if (matchedMethod.name === "bulkBuyListings") {
            saleDetailsArray = inputData.saleDetailsArray;
            saleSignatures = inputData.sellerSignatures;
          } else if (matchedMethod.name === "bulkAcceptOffers") {
            saleDetailsArray = inputData.params.saleDetailsArray;
            saleSignatures = inputData.params.buyerSignaturesArray;
            tokenSetProofs = inputData.params.tokenSetProofsArray;
          }

          for (let i = 0; i < saleDetailsArray.length; i++) {
            const [saleDetail, saleSignature] = [saleDetailsArray[i], saleSignatures[i]];
            if (!saleDetail) {
              continue;
            }

            const tokenAddress = saleDetail["tokenAddress"].toLowerCase();
            const tokenId = saleDetail["tokenId"].toString();
            const currency = saleDetail["paymentMethod"].toLowerCase();
            const currencyPrice = saleDetail["itemPrice"].div(saleDetail["amount"]).toString();
            const paymentMethod = saleDetail["paymentMethod"].toLowerCase();

            // For bulk fill, we need to select the ones that match with current event
            if (
              ["bulkAcceptOffers", "bulkBuyListings", "sweepCollection"].includes(
                matchedMethod.name
              )
            ) {
              if (
                !(
                  tokenAddress === tokenAddressOfEvent &&
                  tokenId === tokenIdOfEvent &&
                  paymentMethod === paymentCoinOfEvent
                )
              ) {
                // Skip
                continue;
              }
            }

            const isBuyOrder = subKind.includes("accept-offer");
            const maker = isBuyOrder
              ? parsedLog.args["buyer"].toLowerCase()
              : parsedLog.args["seller"].toLowerCase();

            let taker = isBuyOrder
              ? parsedLog.args["seller"].toLowerCase()
              : parsedLog.args["buyer"].toLowerCase();

            const orderSide = !isBuyOrder ? "sell" : "buy";
            const makerMinNonce = await commonHelpers.getMinNonce("payment-processor-v2", maker);

            const orderSignature = saleSignature;
            const signature = {
              r: orderSignature.r,
              s: orderSignature.s,
              v: orderSignature.v,
            };

            let order: Sdk.PaymentProcessorV2.Order;
            if (isCollectionLevelOffer) {
              const tokenSetProof = tokenSetProofs[i];
              if (tokenSetProof.rootHash === HashZero) {
                const builder = new Sdk.PaymentProcessorV2.Builders.ContractWide(config.chainId);
                order = builder.build({
                  protocol: saleDetail["protocol"],
                  marketplace: saleDetail["marketplace"],
                  beneficiary: saleDetail["beneficiary"],
                  marketplaceFeeNumerator: saleDetail["marketplaceFeeNumerator"],
                  maxRoyaltyFeeNumerator: saleDetail["maxRoyaltyFeeNumerator"],
                  maker: saleDetail["maker"],
                  tokenAddress: saleDetail["tokenAddress"],
                  amount: saleDetail["amount"],
                  itemPrice: saleDetail["itemPrice"],
                  expiration: saleDetail["expiration"],
                  nonce: saleDetail["nonce"],
                  paymentMethod: saleDetail["paymentMethod"],
                  masterNonce: makerMinNonce,
                  ...signature,
                });
              } else {
                const builder = new Sdk.PaymentProcessorV2.Builders.TokenList(config.chainId);
                order = builder.build({
                  protocol: saleDetail["protocol"],
                  marketplace: saleDetail["marketplace"],
                  beneficiary: saleDetail["beneficiary"],
                  marketplaceFeeNumerator: saleDetail["marketplaceFeeNumerator"],
                  maxRoyaltyFeeNumerator: saleDetail["maxRoyaltyFeeNumerator"],
                  maker: saleDetail["maker"],
                  tokenAddress: saleDetail["tokenAddress"],
                  amount: saleDetail["amount"],
                  itemPrice: saleDetail["itemPrice"],
                  expiration: saleDetail["expiration"],
                  nonce: saleDetail["nonce"],
                  paymentMethod: saleDetail["paymentMethod"],
                  masterNonce: makerMinNonce,
                  tokenSetMerkleRoot: tokenSetProof.rootHash,
                  tokenIds: [],
                  ...signature,
                });
              }
            } else {
              const builder = new Sdk.PaymentProcessorV2.Builders.SingleToken(config.chainId);
              order = builder.build({
                protocol: saleDetail["protocol"],
                marketplace: saleDetail["marketplace"],
                marketplaceFeeNumerator: saleDetail["marketplaceFeeNumerator"],
                maxRoyaltyFeeNumerator: saleDetail["maxRoyaltyFeeNumerator"],
                tokenAddress: saleDetail["tokenAddress"],
                amount: saleDetail["amount"],
                tokenId: saleDetail["tokenId"],
                expiration: saleDetail["expiration"],
                itemPrice: saleDetail["itemPrice"],
                maker: saleDetail["maker"],
                ...(isBuyOrder
                  ? {
                      beneficiary: saleDetail["beneficiary"],
                    }
                  : {}),
                nonce: saleDetail["nonce"],
                paymentMethod: saleDetail["paymentMethod"],
                masterNonce: makerMinNonce,
                ...signature,
              });
            }

            let isValidated = false;
            for (let nonce = Number(order.params.masterNonce); nonce >= 0; nonce--) {
              order.params.masterNonce = nonce.toString();
              try {
                order.checkSignature();
                isValidated = true;
                break;
              } catch {
                // Skip errors
              }
            }

            const priceData = await getUSDAndNativePrices(
              currency,
              currencyPrice,
              baseEventParams.timestamp
            );
            if (!priceData.nativePrice) {
              // We must always have the native price
              break;
            }

            let orderId = isValidated ? order.hash() : undefined;

            // If we couldn't parse the order id from the calldata try to get it from our db
            if (!orderId) {
              orderId = await commonHelpers.getOrderIdFromNonce(
                "payment-processor-v2",
                order.params.sellerOrBuyer,
                order.params.nonce
              );
            }

            // Handle: attribution
            const orderKind = "payment-processor-v2";
            const attributionData = await utils.extractAttributionData(
              baseEventParams.txHash,
              orderKind,
              { orderId }
            );
            if (attributionData.taker) {
              taker = attributionData.taker;
            }

            onChainData.fillEventsPartial.push({
              orderId,
              orderKind: "payment-processor-v2",
              orderSide,
              maker,
              taker,
              price: priceData.nativePrice,
              currency,
              currencyPrice,
              usdPrice: priceData.usdPrice,
              contract: tokenAddress,
              tokenId,
              amount: tokenAmountOfEvent,
              orderSourceId: attributionData.orderSource?.id,
              aggregatorSourceId: attributionData.aggregatorSource?.id,
              fillSourceId: attributionData.fillSource?.id,
              baseEventParams,
            });

            onChainData.fillInfos.push({
              context: `${orderId}-${baseEventParams.txHash}`,
              orderId: orderId,
              orderSide,
              contract: tokenAddress,
              tokenId,
              amount: tokenAmountOfEvent,
              price: priceData.nativePrice,
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
                  orderKind,
                },
              });
            }
          }
        }

        break;
      }

      case "payment-processor-v2-updated-token-level-pricing-boundaries":
      case "payment-processor-v2-updated-collection-level-pricing-boundaries":
      case "payment-processor-v2-updated-collection-payment-settings": {
        const parsedLog = eventData.abi.parseLog(log);
        const tokenAddress = parsedLog.args["tokenAddress"].toLowerCase();

        // Refresh
        await paymentProcessorV2Utils.getConfigByContract(tokenAddress, true);

        // Update backfilled royalties
        const royaltyBackfillReceiver = parsedLog.args["royaltyBackfillReceiver"].toLowerCase();
        const royaltyBackfillNumerator = parsedLog.args["royaltyBackfillNumerator"];
        await paymentProcessorV2Utils.saveBackfilledRoyalties(tokenAddress, [
          {
            recipient: royaltyBackfillReceiver,
            bps: royaltyBackfillNumerator,
          },
        ]);

        break;
      }

      case "payment-processor-v2-trusted-channel-removed-for-collection":
      case "payment-processor-v2-trusted-channel-added-for-collection": {
        const parsedLog = eventData.abi.parseLog(log);
        const tokenAddress = parsedLog.args["tokenAddress"].toLowerCase();

        // Refresh
        await paymentProcessorV2Utils.getTrustedChannels(tokenAddress, true);

        break;
      }

      case "payment-processor-v2-banned-account-added-for-collection":
      case "payment-processor-v2-banned-account-removed-for-collection": {
        const parsedLog = eventData.abi.parseLog(log);
        const tokenAddress = parsedLog.args["tokenAddress"].toLowerCase();

        // Refresh
        await paymentProcessorV2Utils.getBannedAccounts(tokenAddress, true);

        break;
      }

      case "payment-processor-v2-payment-method-added-to-whitelist":
      case "payment-processor-v2-payment-method-removed-from-whitelist": {
        const parsedLog = eventData.abi.parseLog(log);
        const paymentMethodWhitelistId = parsedLog.args["paymentMethodWhitelistId"];

        // Refresh
        await paymentProcessorV2Utils.getPaymentMethods(paymentMethodWhitelistId, true);

        break;
      }
    }
  }
};

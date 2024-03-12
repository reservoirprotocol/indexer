import { Result, defaultAbiCoder } from "@ethersproject/abi";
import { Log } from "@ethersproject/abstract-provider";
import { HashZero } from "@ethersproject/constants";
import { searchForCalls } from "@georgeroman/evm-tx-simulator";
import * as Sdk from "@reservoir0x/sdk";
import { AddressZero } from "@ethersproject/constants";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import { getERC20Transfer } from "@/events-sync/handlers/utils/erc20";
import * as utils from "@/events-sync/utils";
import { orderFixesJob } from "@/jobs/order-fixes/order-fixes-job";
import * as commonHelpers from "@/orderbook/orders/common/helpers";
import { getUSDAndNativePrices } from "@/utils/prices";
import * as paymentProcessorV2Utils from "@/utils/payment-processor-v2-base";

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

    const orderKind = subKind.includes("payment-processor-v2.0.1")
      ? "payment-processor-v2.0.1"
      : "payment-processor-v2";

    const isV201 = subKind.includes("payment-processor-v2.0.1");

    switch (subKind) {
      case "payment-processor-v2.0.1-nonce-invalidated":
      case "payment-processor-v2-nonce-invalidated": {
        const parsedLog = eventData.abi.parseLog(log);
        const maker = parsedLog.args["account"].toLowerCase();
        const nonce = parsedLog.args["nonce"].toString();

        onChainData.nonceCancelEvents.push({
          orderKind,
          maker,
          nonce,
          baseEventParams,
        });

        break;
      }

      case "payment-processor-v2.0.1-nonce-restored": {
        const parsedLog = eventData.abi.parseLog(log);
        const maker = parsedLog.args["account"].toLowerCase();
        const nonce = parsedLog.args["nonce"].toString();

        onChainData.nonceRestoreEvents.push({
          orderKind,
          maker,
          nonce,
          baseEventParams,
        });

        break;
      }

      case "payment-processor-v2.0.1-order-digest-invalidated":
      case "payment-processor-v2-order-digest-invalidated": {
        const parsedLog = eventData.abi.parseLog(log);
        const orderId = parsedLog.args["orderDigest"].toLowerCase();
        const wasCancellation = parsedLog.args["wasCancellation"];
        if (wasCancellation && isV201) {
          onChainData.cancelEvents.push({
            orderKind,
            orderId,
            baseEventParams,
          });
        }
        break;
      }

      case "payment-processor-v2.0.1-master-nonce-invalidated":
      case "payment-processor-v2-master-nonce-invalidated": {
        const parsedLog = eventData.abi.parseLog(log);
        const maker = parsedLog.args["account"].toLowerCase();
        const newNonce = parsedLog.args["nonce"].toString();

        // Cancel all maker's orders
        onChainData.bulkCancelEvents.push({
          orderKind: orderKind,
          maker,
          minNonce: newNonce,
          acrossAll: true,
          baseEventParams,
        });

        break;
      }

      case "payment-processor-v2.0.1-accept-offer-erc1155":
      case "payment-processor-v2.0.1-accept-offer-erc721":
      case "payment-processor-v2.0.1-buy-listing-erc1155":
      case "payment-processor-v2.0.1-buy-listing-erc721":
      case "payment-processor-v2-accept-offer-erc1155":
      case "payment-processor-v2-accept-offer-erc721":
      case "payment-processor-v2-buy-listing-erc1155":
      case "payment-processor-v2-buy-listing-erc721": {
        // Again the events are extremely poorly designed (order hash is not emitted)
        // so we have to rely on complex tricks (using call tracing) to associate the
        // sales to order ids

        const parsedLog = eventData.abi.parseLog(log);

        const txHash = baseEventParams.txHash;

        const isV201 = subKind.includes("payment-processor-v2.0.1");

        const exchange = isV201
          ? new Sdk.PaymentProcessorV201.Exchange(config.chainId)
          : new Sdk.PaymentProcessorV2.Exchange(config.chainId);
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
          } catch (error) {
            logger.info(
              "pp-v2",
              JSON.stringify({
                msg: "Could not get transaction trace",
                log,
                parsingError: true,
                error,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                stack: (error as any).stack,
              })
            );
            if (!process.env.LOCAL_TESTING) throw new Error("Could not get transaction trace");
          }
        } else {
          logger.info(
            "pp-v2",
            JSON.stringify({ msg: "Could not get transaction trace", log, isMissingTrace: true })
          );
          if (!process.env.LOCAL_TESTING) {
            throw new Error("Could not get transaction trace");
          }
        }

        // Fallback for testing
        if (process.env.LOCAL_TESTING && relevantCalls.length === 0) {
          relevantCalls.push((await utils.fetchTransaction(txHash)).data);
        }

        for (const relevantCalldata of relevantCalls) {
          const matchedMethod = methods.find((c) => relevantCalldata.includes(c.selector));
          if (!matchedMethod) {
            logger.info(
              "pp-v2",
              JSON.stringify({ msg: "Missing matched method", log, relevantCalldata })
            );
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
          let cosignatures = [inputData.cosignature];

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
            cosignatures = inputData.cosignatures;
          } else if (matchedMethod.name === "bulkAcceptOffers") {
            saleDetailsArray = inputData.params.saleDetailsArray;
            saleSignatures = inputData.params.buyerSignaturesArray;
            tokenSetProofs = inputData.params.tokenSetProofsArray;
            cosignatures = inputData.params.cosignaturesArray;
          }

          for (let i = 0; i < saleDetailsArray.length; i++) {
            const [saleDetail, saleSignature, cosignature] = [
              saleDetailsArray[i],
              saleSignatures[i],
              cosignatures[i],
            ];
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
            const makerMinNonce = await commonHelpers.getMinNonce(orderKind, maker);

            const orderSignature = saleSignature;
            const signature = {
              r: orderSignature.r,
              s: orderSignature.s,
              v: orderSignature.v,
            };

            let order: Sdk.PaymentProcessorBase.IOrder;

            const cosigner = cosignature ? cosignature.signer.toLowerCase() : AddressZero;

            if (isCollectionLevelOffer) {
              const tokenSetProof = tokenSetProofs[i];
              if (tokenSetProof.rootHash === HashZero) {
                const builder = new Sdk.PaymentProcessorBase.Builders.ContractWide(config.chainId);
                order = isV201
                  ? builder.build(
                      {
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
                        cosigner,
                        ...signature,
                      },
                      Sdk.PaymentProcessorV201.Order
                    )
                  : builder.build(
                      {
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
                        cosigner,
                        ...signature,
                      },
                      Sdk.PaymentProcessorV2.Order
                    );
              } else {
                const builder = new Sdk.PaymentProcessorBase.Builders.TokenList(config.chainId);
                order = isV201
                  ? builder.build(
                      {
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
                        cosigner,
                        ...signature,
                      },
                      Sdk.PaymentProcessorV201.Order
                    )
                  : builder.build(
                      {
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
                        cosigner,
                        ...signature,
                      },
                      Sdk.PaymentProcessorV2.Order
                    );
              }
            } else {
              const builder = new Sdk.PaymentProcessorBase.Builders.SingleToken(config.chainId);
              order = isV201
                ? builder.build(
                    {
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
                      cosigner,
                      ...signature,
                    },
                    Sdk.PaymentProcessorV201.Order
                  )
                : builder.build(
                    {
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
                      cosigner,
                      ...signature,
                    },
                    Sdk.PaymentProcessorV2.Order
                  );
            }

            let isValidated = false;
            for (let nonce = Number(order.params.masterNonce); nonce >= 0; nonce--) {
              order.params.masterNonce = nonce.toString();
              try {
                (order as Sdk.PaymentProcessorV2.Order).checkSignature();
                isValidated = true;
                break;
              } catch {
                // Skip errors
              }
            }

            // console.log('order', {
            //   isValidated
            // }, order.params, cosignature)

            const priceData = await getUSDAndNativePrices(
              currency,
              currencyPrice,
              baseEventParams.timestamp
            );
            if (!priceData.nativePrice) {
              // We must always have the native price
              break;
            }

            let orderId = isValidated ? (isV201 ? order.hashDigest() : order.hash()) : undefined;

            // If we couldn't parse the order id from the calldata try to get it from our db
            if (!orderId) {
              orderId = await commonHelpers.getOrderIdFromNonce(
                orderKind,
                order.params.sellerOrBuyer,
                order.params.nonce
              );
            }

            if (
              orderId &&
              order.params.protocol ===
                Sdk.PaymentProcessorV2.Types.OrderProtocols.ERC1155_FILL_PARTIAL
            ) {
              await orderFixesJob.addToQueue([{ by: "id", data: { id: orderId } }], 5000);
            }

            // Handle: attribution
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
              orderKind,
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

      case "payment-processor-v2.0.1-updated-token-level-pricing-boundaries":
      case "payment-processor-v2.0.1-updated-collection-level-pricing-boundaries":
      case "payment-processor-v2.0.1-updated-collection-payment-settings":
      case "payment-processor-v2-updated-token-level-pricing-boundaries":
      case "payment-processor-v2-updated-collection-level-pricing-boundaries":
      case "payment-processor-v2-updated-collection-payment-settings": {
        const parsedLog = eventData.abi.parseLog(log);
        const tokenAddress = parsedLog.args["tokenAddress"].toLowerCase();

        // Refresh
        await paymentProcessorV2Utils.getConfigByContract(
          Sdk.PaymentProcessorV201.Addresses.Exchange[config.chainId],
          tokenAddress,
          true
        );

        // Update backfilled royalties
        const royaltyBackfillReceiver = parsedLog.args["royaltyBackfillReceiver"].toLowerCase();
        const royaltyBackfillNumerator = parsedLog.args["royaltyBackfillNumerator"];
        await paymentProcessorV2Utils.saveBackfilledRoyalties(
          Sdk.PaymentProcessorV201.Addresses.Exchange[config.chainId],
          tokenAddress,
          [
            {
              recipient: royaltyBackfillReceiver,
              bps: royaltyBackfillNumerator,
            },
          ]
        );

        break;
      }

      case "payment-processor-v2.0.1-trusted-channel-removed-for-collection":
      case "payment-processor-v2.0.1-trusted-channel-added-for-collection":
      case "payment-processor-v2-trusted-channel-removed-for-collection":
      case "payment-processor-v2-trusted-channel-added-for-collection": {
        const parsedLog = eventData.abi.parseLog(log);
        const tokenAddress = parsedLog.args["tokenAddress"].toLowerCase();

        // Refresh
        await paymentProcessorV2Utils.getTrustedChannels(
          Sdk.PaymentProcessorV201.Addresses.Exchange[config.chainId],
          tokenAddress,
          true
        );

        break;
      }

      case "payment-processor-v2.0.1-banned-account-added-for-collection":
      case "payment-processor-v2.0.1-banned-account-removed-for-collection":
      case "payment-processor-v2-banned-account-added-for-collection":
      case "payment-processor-v2-banned-account-removed-for-collection": {
        const parsedLog = eventData.abi.parseLog(log);
        const tokenAddress = parsedLog.args["tokenAddress"].toLowerCase();

        // Refresh
        await paymentProcessorV2Utils.getBannedAccounts(
          Sdk.PaymentProcessorV201.Addresses.Exchange[config.chainId],
          tokenAddress,
          true
        );

        break;
      }

      case "payment-processor-v2.0.1-payment-method-added-to-whitelist":
      case "payment-processor-v2.0.1-payment-method-removed-from-whitelist":
      case "payment-processor-v2-payment-method-added-to-whitelist":
      case "payment-processor-v2-payment-method-removed-from-whitelist": {
        const parsedLog = eventData.abi.parseLog(log);
        const paymentMethodWhitelistId = parsedLog.args["paymentMethodWhitelistId"];

        // Refresh
        await paymentProcessorV2Utils.getPaymentMethods(
          Sdk.PaymentProcessorV201.Addresses.Exchange[config.chainId],
          paymentMethodWhitelistId,
          true
        );

        break;
      }
    }
  }
};

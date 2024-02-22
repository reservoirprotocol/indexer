import { Interface, defaultAbiCoder } from "@ethersproject/abi";
import { Provider } from "@ethersproject/abstract-provider";
import { Signer } from "@ethersproject/abstract-signer";
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";
import { Contract, ContractTransaction } from "@ethersproject/contracts";
import { _TypedDataEncoder } from "@ethersproject/hash";

import * as Addresses from "./addresses";
import { MatchingOptions } from "./builders/base";
import { EIP712_DOMAIN, Order } from "./order";
import { SweepOrderParams } from "./types";
import { TxData, bn, generateSourceBytes } from "../utils";

import ExchangeAbi from "./abis/Exchange.json";

export class Exchange {
  public chainId: number;
  public contract: Contract;
  public domainSeparator: string;

  constructor(chainId: number) {
    this.chainId = chainId;
    this.contract = new Contract(Addresses.Exchange[this.chainId], ExchangeAbi);
    this.domainSeparator = this.buildDomainSeparator();
  }

  private buildDomainSeparator() {
    const domain = EIP712_DOMAIN(this.chainId);
    return _TypedDataEncoder.hashDomain(domain);
  }

  // --- Get master nonce ---

  public async getMasterNonce(provider: Provider, user: string): Promise<BigNumber> {
    return this.contract.connect(provider).masterNonces(user);
  }

  // --- Cancel order ---

  public async cancelOrder(maker: Signer, order: Order): Promise<ContractTransaction> {
    const tx = this.cancelOrderTx(await maker.getAddress(), order);
    return maker.sendTransaction(tx);
  }

  public cancelOrderTx(maker: string, order: Order): TxData {
    return {
      from: maker,
      to: this.contract.address,
      data: this.contract.interface.encodeFunctionData("revokeSingleNonce", [
        defaultAbiCoder.encode(["uint256"], [order.params.nonce]),
      ]),
    };
  }

  // --- Increase master nonce ---

  public async revokeMasterNonce(maker: Signer): Promise<ContractTransaction> {
    const tx = this.revokeMasterNonceTx(await maker.getAddress());
    return maker.sendTransaction(tx);
  }

  public revokeMasterNonceTx(maker: string): TxData {
    const data: string = this.contract.interface.encodeFunctionData("revokeMasterNonce", []);
    return {
      from: maker,
      to: this.contract.address,
      data,
    };
  }

  // --- Fill single order ---

  public async fillOrder(
    taker: Signer,
    order: Order,
    matchOptions: MatchingOptions,
    options?: {
      trustedChannel?: string;
      source?: string;
      relayer?: string;
      fee?: {
        recipient: string;
        amount: BigNumberish;
      };
    }
  ): Promise<ContractTransaction> {
    const tx = this.fillOrderTx(await taker.getAddress(), order, matchOptions, options);
    return taker.sendTransaction(tx);
  }

  public fillOrderTx(
    taker: string,
    order: Order,
    matchOptions: MatchingOptions,
    options?: {
      trustedChannel?: string;
      source?: string;
      relayer?: string;
      fee?: {
        recipient: string;
        amount: BigNumberish;
      };
    }
  ): TxData {
    const feeOnTop = options?.fee ?? {
      recipient: AddressZero,
      amount: bn(0),
    };

    const sender = options?.relayer ?? taker;

    const matchedOrder = order.buildMatching(matchOptions);

    const isCollectionOffer = order.isCollectionLevelOffer();
    const data = order.isBuyOrder()
      ? this.contract.interface.encodeFunctionData("acceptOffer", [
          defaultAbiCoder.encode(
            [
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
            [
              this.domainSeparator,
              isCollectionOffer,
              matchedOrder,
              matchedOrder.signature,
              order.getTokenSetProof(),
              order.getCosignature(),
              feeOnTop,
            ]
          ),
        ])
      : this.contract.interface.encodeFunctionData("buyListing", [
          defaultAbiCoder.encode(
            [
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
            [
              this.domainSeparator,
              matchedOrder,
              matchedOrder.signature,
              order.getCosignature(),
              feeOnTop,
            ]
          ),
        ]);

    const passValue =
      !order.isBuyOrder() &&
      order.params.sellerOrBuyer != taker.toLowerCase() &&
      matchedOrder.paymentMethod === AddressZero;

    const fillAmount = matchOptions.amount ?? 1;
    const fillValue = bn(order.params.itemPrice)
      .div(order.params.amount)
      .mul(bn(fillAmount))
      .add(feeOnTop.amount);

    let tx: TxData = {
      from: sender,
      to: this.contract.address,
      value: passValue ? fillValue.toString() : "0",
      data: data + (options?.trustedChannel ? "" : generateSourceBytes(options?.source)),
      gas: String(300000 + 200000 * 1),
    };

    if (options?.trustedChannel) {
      tx = this.forwardCallTx(tx, options?.trustedChannel, options);
    }

    return tx;
  }

  // --- Fill multiple orders ---

  public fillOrdersTx(
    taker: string,
    orders: Order[],
    matchOptions: MatchingOptions[],
    options?: {
      trustedChannel?: string;
      source?: string;
      relayer?: string;
      fees?: {
        recipient: string;
        amount: BigNumberish;
      }[];
    }
  ): TxData {
    if (orders.length === 1) {
      return this.fillOrderTx(taker, orders[0], matchOptions[0], {
        trustedChannel: options?.trustedChannel,
        source: options?.source,
        fee: options?.fees?.length ? options.fees[0] : undefined,
      });
    }

    const sender = options?.relayer ?? taker;

    const allFees: {
      recipient: string;
      amount: BigNumberish;
    }[] = [];

    let price = bn(0);

    let tx: TxData;

    const isBuyOrder = orders[0].isBuyOrder();
    if (isBuyOrder) {
      const saleDetails = orders.map((order, i) => {
        const matchedOrder = order.buildMatching(matchOptions[i]);
        const associatedFee =
          options?.fees && options.fees[i]
            ? options.fees[i]
            : {
                recipient: AddressZero,
                amount: bn(0),
              };

        allFees.push(associatedFee);

        return matchedOrder;
      });

      const data = this.contract.interface.encodeFunctionData("bulkAcceptOffers", [
        defaultAbiCoder.encode(
          [
            "bytes32",
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
            )`,
          ],
          [
            this.domainSeparator,
            {
              isCollectionLevelOfferArray: orders.map(
                (c) => c.params.kind === "collection-offer-approval"
              ),
              saleDetailsArray: saleDetails,
              buyerSignaturesArray: saleDetails.map((c) => c.signature),
              tokenSetProofsArray: orders.map((c) => c.getTokenSetProof()),
              cosignaturesArray: orders.map((c) => c.getCosignature()),
              feesOnTopArray: allFees,
            },
          ]
        ),
      ]);

      tx = {
        from: sender,
        to: this.contract.address,
        data: data + (options?.trustedChannel ? "" : generateSourceBytes(options?.source)),
        gas: String(300000 + 200000 * orders.length),
      };
    } else {
      const saleDetails = orders.map((order, i) => {
        const matchedOrder = order.buildMatching(matchOptions[i]);

        const associatedFee =
          options?.fees && options.fees[i]
            ? options.fees[i]
            : {
                recipient: AddressZero,
                amount: bn(0),
              };

        const fillAmount = matchOptions[i].amount ?? 1;
        const fillValue = bn(order.params.itemPrice)
          .div(order.params.amount)
          .mul(bn(fillAmount))
          .add(associatedFee.amount);

        const passValue =
          !order.isBuyOrder() &&
          order.params.sellerOrBuyer != taker.toLowerCase() &&
          matchedOrder.paymentMethod === AddressZero;
        if (passValue) {
          price = price.add(fillValue);
        }

        allFees.push(associatedFee);

        return matchedOrder;
      });

      const data = this.contract.interface.encodeFunctionData("bulkBuyListings", [
        defaultAbiCoder.encode(
          [
            "bytes32",
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
            )[]`,
            "(uint8 v, bytes32 r, bytes32 s)[]",
            "(address signer, address taker, uint256 expiration, uint8 v, bytes32 r, bytes32 s)[]",
            "(address recipient, uint256 amount)[]",
          ],
          [
            this.domainSeparator,
            saleDetails,
            saleDetails.map((c) => c.signature),
            orders.map((c) => c.getCosignature()),
            allFees,
          ]
        ),
      ]);

      tx = {
        from: sender,
        to: this.contract.address,
        value: price.toString(),
        data: data + (options?.trustedChannel ? "" : generateSourceBytes(options?.source)),
        gas: String(300000 + 200000 * orders.length),
      };
    }

    if (options?.trustedChannel) {
      tx = this.forwardCallTx(tx, options?.trustedChannel, options);
    }

    return tx;
  }

  // --- Fill multiple listings from the same collection ---

  public sweepCollectionTx(
    taker: string,
    orders: Order[],
    options?: {
      trustedChannel?: string;
      source?: string;
      relayer?: string;
      fee?: {
        recipient: string;
        amount: BigNumberish;
      };
    }
  ): TxData {
    const feeOnTop = options?.fee ?? {
      recipient: AddressZero,
      amount: bn(0),
    };

    const sender = options?.relayer ?? taker;

    let price = bn(0);
    orders.forEach((order) => {
      const passValue = order.params.paymentMethod === AddressZero;
      if (passValue) {
        price = price.add(order.params.itemPrice);
      }
    });

    const sweepCollectionParams = this.getSweepOrderParams(taker, orders);
    const data = this.contract.interface.encodeFunctionData("sweepCollection", [
      defaultAbiCoder.encode(
        [
          "bytes32",
          "(address recipient, uint256 amount)",
          "(uint8 protocol, address tokenAddress, address paymentMethod, address beneficiary)",
          `(
            address maker,
            address marketplace,
            address fallbackRoyaltyRecipient,
            uint256 tokenId,
            uint248 amount,
            uint256 itemPrice,
            uint256 nonce,
            uint256 expiration,
            uint256 marketplaceFeeNumerator,
            uint256 maxRoyaltyFeeNumerator
          )[]`,
          "(uint8 v, bytes32 r, bytes32 s)[]",
          "(address signer, address taker, uint256 expiration, uint8 v, bytes32 r, bytes32 s)[]",
        ],
        [
          this.domainSeparator,
          feeOnTop,
          sweepCollectionParams.sweepOrder,
          sweepCollectionParams.items,
          sweepCollectionParams.signedSellOrders,
          sweepCollectionParams.cosignatures,
        ]
      ),
    ]);

    let tx: TxData = {
      from: sender,
      to: this.contract.address,
      value: price.toString(),
      data: data + (options?.trustedChannel ? "" : generateSourceBytes(options?.source)),
      gas: String(300000 + 200000 * orders.length),
    };

    if (options?.trustedChannel) {
      tx = this.forwardCallTx(tx, options?.trustedChannel, options);
    }

    return tx;
  }

  // --- Wrap tx data via a trusted channel forwarder ---

  public forwardCallTx(tx: TxData, channel: string, options?: { source?: string }) {
    return {
      ...tx,
      to: channel,
      data:
        new Interface([
          "function forwardCall(address target, bytes calldata message) external payable",
        ]).encodeFunctionData("forwardCall", [tx.to, tx.data]) +
        generateSourceBytes(options?.source),
    };
  }

  // --- Get parameters for sweeping multiple orders from the same collection ---

  public getSweepOrderParams(taker: string, orders: Order[]): SweepOrderParams {
    const firstOrder = orders[0];
    const matchedOrder = firstOrder.buildMatching({
      taker,
    });

    return {
      sweepOrder: {
        protocol: matchedOrder.protocol,
        tokenAddress: matchedOrder.tokenAddress,
        paymentMethod: matchedOrder.paymentMethod,
        beneficiary: matchedOrder.beneficiary!,
      },
      items: orders.map(({ params: sellOrder }) => ({
        maker: sellOrder.sellerOrBuyer,
        marketplace: sellOrder.marketplace,
        tokenId: sellOrder.tokenId ?? "0",
        fallbackRoyaltyRecipient: sellOrder.fallbackRoyaltyRecipient ?? AddressZero,
        amount: sellOrder.amount,
        itemPrice: sellOrder.itemPrice,
        nonce: sellOrder.nonce,
        expiration: sellOrder.expiration,
        marketplaceFeeNumerator: sellOrder.marketplaceFeeNumerator,
        maxRoyaltyFeeNumerator: sellOrder.maxRoyaltyFeeNumerator ?? "0",
      })),
      signedSellOrders: orders.map((c) => {
        return {
          r: c.params.r!,
          s: c.params.s!,
          v: c.params.v!,
        };
      }),
      cosignatures: orders.map((c) => c.getCosignature()),
    };
  }
}

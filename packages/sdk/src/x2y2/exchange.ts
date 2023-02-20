import { defaultAbiCoder } from "@ethersproject/abi";
import { Signer } from "@ethersproject/abstract-signer";
import { arrayify, splitSignature } from "@ethersproject/bytes";
import { Contract } from "@ethersproject/contracts";
import { keccak256 } from "@ethersproject/keccak256";
import axios from "axios";

import * as Addresses from "./addresses";
import { Order } from "./order";
import * as Types from "./types";
import { TxData, bn, generateSourceBytes } from "../utils";

import ExchangeAbi from "./abis/Exchange.json";

export class Exchange {
  public chainId: number;
  public contract: Contract;
  public apiKey: string;

  constructor(chainId: number, apiKey: string) {
    this.chainId = chainId;
    this.contract = new Contract(Addresses.Exchange[this.chainId], ExchangeAbi);
    this.apiKey = apiKey;
  }

  // --- Sign order ---

  private hash(order: Types.LocalOrder): string {
    return keccak256(
      defaultAbiCoder.encode(
        [
          `uint256`,
          `address`,
          `uint256`,
          `uint256`,
          `uint256`,
          `uint256`,
          `address`,
          `bytes`,
          `uint256`,
          `(uint256 price, bytes data)[]`,
        ],
        [
          order.salt,
          order.user,
          order.network,
          order.intent,
          order.delegateType,
          order.deadline,
          order.currency,
          order.dataMask,
          order.items.length,
          order.items,
        ]
      )
    );
  }

  public async signOrder(signer: Signer, order: Types.LocalOrder) {
    const signature = splitSignature(
      await signer.signMessage(arrayify(this.hash(order)))
    );

    order.v = signature.v;
    order.r = signature.r;
    order.s = signature.s;
  }

  public getOrderSignatureData(order: Types.LocalOrder) {
    return {
      signatureKind: "eip191",
      message: this.hash(order),
    };
  }

  // --- Post order ---

  public async postOrder(order: Types.LocalOrder, orderId?: number) {
    const orderPayload = {
      order: defaultAbiCoder.encode(
        [
          `(
            uint256 salt,
            address user,
            uint256 network,
            uint256 intent,
            uint256 delegateType,
            uint256 deadline,
            address currency,
            bytes dataMask,
            (uint256 price, bytes data)[] items,
            bytes32 r,
            bytes32 s,
            uint8 v,
            uint8 signVersion
          )`,
        ],
        [order]
      ),
      isBundle: false,
      bundleName: "",
      bundleDesc: "",
      orderIds: orderId ? [orderId] : [],
      changePrice: Boolean(orderId),
      isCollection: order.dataMask !== "0x",
    };

    return axios.post(
      `https://${
        this.chainId === 5 ? "goerli-" : ""
      }api.x2y2.org/api/orders/add`,
      orderPayload,
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "X-Api-Key": this.apiKey,
        },
      }
    );
  }

  // --- Fill order ---

  public async fillOrder(
    taker: Signer,
    order: Order,
    options?: { source?: string; tokenId?: string }
  ) {
    const tx = await this.fillOrderTx(await taker.getAddress(), order, options);
    return taker.sendTransaction(tx);
  }

  public async fillOrderTx(
    taker: string,
    order: Order,
    options?: { source?: string; tokenId?: string }
  ): Promise<TxData> {
    const input = await this.fetchInput(taker, order, options);

    return {
      from: taker,
      data: input + generateSourceBytes(options?.source),
      to: this.contract.address,
      value: bn(order.params.price).toHexString(),
    };
  }

  // --- Cancel order ---

  public async cancelOrder(maker: Signer, order: Order) {
    const tx = await this.cancelOrderTx(maker, order);
    return maker.sendTransaction(tx);
  }

  public async cancelOrderTx(maker: Signer, order: Order): Promise<TxData> {
    const signMessage = keccak256("0x");
    const sign = await maker.signMessage(arrayify(signMessage));

    const response = await axios.post(
      `https://${
        this.chainId === 5 ? "goerli-" : ""
      }api.x2y2.org/api/orders/cancel`,
      {
        caller: maker,
        // CANCEL_OFFER
        op: 3,
        items: [{ orderId: order.params.id }],
        sign_message: signMessage,
        sign,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": this.apiKey,
        },
      }
    );

    const input = defaultAbiCoder.decode(
      [
        "(bytes32[] itemHashes, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
      ],
      response.data.input
    )[0];

    return {
      from: await maker.getAddress(),
      data: this.contract.interface.encodeFunctionData("cancel", [
        input.itemHashes,
        input.deadline,
        input.v,
        input.r,
        input.s,
      ]),
      to: this.contract.address,
    };
  }

  // --- Sign order ---

  public async fetchInput(
    taker: string,
    order: Order,
    options?: { source?: string; tokenId?: string }
  ): Promise<string> {
    if (order.params.type === "buy" && !options?.tokenId) {
      throw new Error("When filling buy orders, `tokenId` must be specified");
    }

    const response = await axios.post(
      `https://${
        this.chainId === 5 ? "goerli-" : ""
      }api.x2y2.org/api/orders/sign`,
      {
        caller: taker,
        op:
          order.params.type === "sell"
            ? Types.Op.COMPLETE_SELL_OFFER
            : Types.Op.COMPLETE_BUY_OFFER,
        amountToEth: "0",
        amountToWeth: "0",
        // Do not check taker's balance (for filling through router contracts)
        check: false,
        items: [
          {
            orderId: order.params.id,
            currency: order.params.currency,
            price: order.params.price,
            tokenId: order.params.type === "buy" ? options?.tokenId : undefined,
          },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": this.apiKey,
          ...(options?.source
            ? {
                "X-Api-Used-By": options?.source,
              }
            : {}),
        },
      }
    );

    return (
      this.contract.interface.getSighash("run") +
      response.data.data[0].input.slice(2)
    );
  }
}

import { Interface } from "@ethersproject/abi";
import { Provider } from "@ethersproject/abstract-provider";
import { HashZero } from "@ethersproject/constants";

import { NFTToken } from "../types";
import * as Sdk from "../../../index";
import { TxData, getCurrentTimestamp, getRandomBytes } from "../../../utils";

import RouterAbi from "../abis/ReservoirV6_0_0.json";
import SeaportModuleAbi from "../abis/SeaportModule.json";

export type Data = {
  order: Sdk.Seaport.Types.OrderComponents;
};

export type Item = {
  token: NFTToken;
  receiver: string;
};

export class Handler {
  public chainId: number;
  public provider: Provider;

  constructor(chainId: number, provider: Provider) {
    this.chainId = chainId;
    this.provider = provider;
  }

  public async generate(
    giver: string,
    items: {
      token: NFTToken;
      receiver: string;
    }[],
    expiresIn = 10 * 60
  ): Promise<Data> {
    const now = getCurrentTimestamp();

    // Build approval order
    const offer = items.map(({ token }) => ({
      itemType: token.kind === "erc721" ? 2 : 3,
      token: token.contract,
      identifierOrCriteria: token.tokenId.toString(),
      startAmount: (token.amount ?? "1").toString(),
      endAmount: (token.amount ?? "1").toString(),
    }));
    const order = new Sdk.Seaport.Order(this.chainId, {
      kind: "single-token",
      offerer: giver,
      zone: Sdk.Seaport.Addresses.ApprovalOrderZone[this.chainId],
      offer,
      consideration: offer.map((o, i) => ({
        ...o,
        recipient: items[i].receiver,
      })),
      orderType: Sdk.Seaport.Types.OrderType.FULL_RESTRICTED,
      startTime: now,
      endTime: now + expiresIn,
      zoneHash: HashZero,
      salt: getRandomBytes().toHexString(),
      conduitKey: Sdk.Seaport.Addresses.OpenseaConduitKey[this.chainId],
      counter: await new Sdk.Seaport.Exchange(this.chainId)
        .getCounter(this.provider, giver)
        .then((c) => c.toString()),
    });

    return { order: order.params };
  }

  public getSignatureData(data: Data) {
    return new Sdk.Seaport.Order(this.chainId, data.order).getSignatureData();
  }

  public attachAndCheckSignature(data: Data, signature: string) {
    data.order.signature = signature;
    new Sdk.Seaport.Order(this.chainId, data.order).checkSignature();
  }

  // Given an already encoded router execution, attach a list of permits to it
  public attachToRouterExecution(txData: TxData, data: Data[]): TxData {
    // Handle the case when there's no permits to attach
    if (!data.length) {
      return txData;
    }

    const routerIface = new Interface(RouterAbi);
    const executionInfos = routerIface.decodeFunctionData(
      "execute",
      txData.data
    ).executionInfos;

    const seaportModuleIface = new Interface(SeaportModuleAbi);
    return {
      ...txData,
      data: routerIface.encodeFunctionData("execute", [
        [
          {
            module: Sdk.RouterV6.Addresses.SeaportModule[this.chainId],
            data: seaportModuleIface.encodeFunctionData("matchOrders", [
              [
                ...data.map(({ order }) => ({
                  parameters: {
                    ...order,
                    totalOriginalConsiderationItems: order.consideration.length,
                  },
                  signature: order.signature,
                })),
              ],
              // For each order, match the single offer item to the single consideration item
              [
                ...data
                  .map(({ order }, i) =>
                    order.offer.map((_, j) => ({
                      offerComponents: [
                        {
                          orderIndex: i * 2,
                          itemIndex: j,
                        },
                      ],
                      considerationComponents: [
                        {
                          orderIndex: i * 2,
                          itemIndex: j,
                        },
                      ],
                    }))
                  )
                  .flat(),
              ],
            ]),
            value: 0,
          },
          ...executionInfos,
        ],
      ]),
    };
  }
}

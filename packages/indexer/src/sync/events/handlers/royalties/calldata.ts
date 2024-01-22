import * as Sdk from "@reservoir0x/sdk";

import { config } from "@/config/index";

function getItemTypeFromOrderType(basicOrderType: number) {
  const ETH_TO_ERC721 = [0, 1, 2, 3].includes(basicOrderType);
  const ETH_TO_ERC1155 = [4, 5, 6, 7].includes(basicOrderType);

  const ERC20_TO_ERC721 = [8, 9, 10, 11].includes(basicOrderType);
  const ERC20_TO_ERC1155 = [12, 13, 14, 15].includes(basicOrderType);

  const ERC721_TO_ERC20 = [16, 17, 18, 19].includes(basicOrderType);
  const ERC1155_TO_ERC20 = [20, 21, 22, 23].includes(basicOrderType);

  const FULL_OPEN = [0, 4, 8, 12, 16, 20].includes(basicOrderType);
  const PARTIAL_OPEN = [1, 5, 9, 13, 17, 21].includes(basicOrderType);
  const FULL_RESTRICTED = [2, 6, 10, 14, 18, 22].includes(basicOrderType);
  const PARTIAL_RESTRICTED = [3, 7, 11, 15, 19, 23].includes(basicOrderType);

  let orderType;

  if (FULL_OPEN) {
    orderType = Sdk.SeaportBase.Types.OrderType.FULL_OPEN;
  } else if (PARTIAL_OPEN) {
    orderType = Sdk.SeaportBase.Types.OrderType.PARTIAL_OPEN;
  } else if (FULL_RESTRICTED) {
    orderType = Sdk.SeaportBase.Types.OrderType.FULL_RESTRICTED;
  } else if (PARTIAL_RESTRICTED) {
    orderType = Sdk.SeaportBase.Types.OrderType.PARTIAL_RESTRICTED;
  }

  if (ETH_TO_ERC721) {
    return {
      offerType: Sdk.SeaportBase.Types.ItemType.ERC721,
      considerationType: Sdk.SeaportBase.Types.ItemType.NATIVE,
      orderType,
    };
  }

  if (ETH_TO_ERC1155) {
    return {
      offerType: Sdk.SeaportBase.Types.ItemType.ERC1155,
      considerationType: Sdk.SeaportBase.Types.ItemType.NATIVE,
      orderType,
    };
  }

  if (ERC20_TO_ERC721) {
    return {
      offerType: Sdk.SeaportBase.Types.ItemType.ERC721,
      considerationType: Sdk.SeaportBase.Types.ItemType.ERC20,
      orderType,
    };
  }

  if (ERC20_TO_ERC1155) {
    return {
      offerType: Sdk.SeaportBase.Types.ItemType.ERC1155,
      considerationType: Sdk.SeaportBase.Types.ItemType.ERC20,
      orderType,
    };
  }

  if (ERC721_TO_ERC20) {
    return {
      offerType: Sdk.SeaportBase.Types.ItemType.ERC20,
      considerationType: Sdk.SeaportBase.Types.ItemType.ERC721,
      orderType,
    };
  }

  if (ERC1155_TO_ERC20) {
    return {
      offerType: Sdk.SeaportBase.Types.ItemType.ERC20,
      considerationType: Sdk.SeaportBase.Types.ItemType.ERC1155,
      orderType,
    };
  }
}

export const extractOrdersFromCalldata = async (calldata: string) => {
  const exchange = new Sdk.SeaportV15.Exchange(config.chainId);
  const basicOrders: Sdk.SeaportBase.BaseOrderInfo[] = [];
  try {
    const { name: funcName, args } = exchange.contract.interface.parseTransaction({
      data: calldata,
    });

    let orders = [];
    if (
      [
        "fulfillAvailableAdvancedOrders",
        "fulfillAvailableOrders",
        "matchOrders",
        "matchAdvancedOrders",
      ].includes(funcName)
    ) {
      orders = args[0];
    } else if (["fulfillAdvancedOrder", "fulfillOrder"].includes(funcName)) {
      orders = [args[0]];
    } else if (["fulfillBasicOrder_efficient_6GL6yc", "fulfillBasicOrder"].includes(funcName)) {
      const parameters = args[0];
      const types = getItemTypeFromOrderType(parameters.basicOrderType);
      orders = [
        {
          parameters: {
            offerer: parameters.offerer,
            zone: parameters.zone,
            orderType: types?.orderType,
            offer: [
              {
                itemType: types?.offerType,
                token: parameters.offerToken,
                identifierOrCriteria: parameters.offerIdentifier,
                startAmount: parameters.offerAmount,
                endAmount: parameters.offerAmount,
              },
            ],
            consideration: [
              {
                itemType: types?.considerationType,
                token: parameters.considerationToken,
                identifierOrCriteria: parameters.considerationIdentifier,
                startAmount: parameters.considerationAmount,
                endAmount: parameters.considerationAmount,
                recipient: parameters.offerer,
              },
            ],
            startTime: parameters.startTime,
            endTime: parameters.endTime,
            zoneHash: parameters.zoneHash,
            salt: parameters.salt,
            conduitKey: parameters.offererConduitKey,
          },
        },
      ];
    }

    for (let i = 0; i < orders.length; i++) {
      try {
        const order = new Sdk.SeaportV15.Order(config.chainId, {
          ...orders[i].parameters,
          // Not important
          counter: 0,
        });
        basicOrders.push(order.getInfo()!);
      } catch {
        // Skip erros
      }
    }
  } catch {
    // Skip errors
  }

  return basicOrders;
};

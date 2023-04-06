import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";

import { idb, redb } from "@/common/db";
import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";
import { OrderKind } from "@/orderbook/orders";
import { toBuffer } from "@/common/utils";

export type Operator = {
  address: string;
  marketplace: OrderKind;
};

const conduitController = new Sdk.SeaportBase.ConduitController(config.chainId);

const allOperatorList: Operator[] = [
  {
    address: Sdk.Blur.Addresses.ExecutionDelegate[config.chainId],
    marketplace: "blur",
  },
  {
    address: Sdk.LooksRare.Addresses.TransferManagerErc721[config.chainId],
    marketplace: "looks-rare",
  },
  {
    address: Sdk.LooksRare.Addresses.TransferManagerErc1155[config.chainId],
    marketplace: "looks-rare",
  },
  {
    address: Sdk.Nftx.Addresses.MarketplaceZap[config.chainId],
    marketplace: "nftx",
  },
  {
    address: conduitController.deriveConduit(
      Sdk.SeaportBase.Addresses.OpenseaConduitKey[config.chainId]
    ),
    marketplace: "seaport",
  },
  {
    address: conduitController.deriveConduit(
      Sdk.SeaportBase.Addresses.OpenseaConduitKey[config.chainId]
    ),
    marketplace: "seaport-v1.4",
  },
  {
    address: Sdk.X2Y2.Addresses.Erc721Delegate[config.chainId],
    marketplace: "x2y2",
  },
  {
    address: Sdk.Element.Addresses.Exchange[config.chainId],
    marketplace: "element-erc721",
  },
  {
    address: Sdk.Element.Addresses.Exchange[config.chainId],
    marketplace: "element-erc1155",
  },
  {
    address: Sdk.Sudoswap.Addresses.LSSVMRouter[config.chainId],
    marketplace: "sudoswap",
  },
];

export const checkMarketplaceIsFiltered = async (contract: string, marketplace: OrderKind) => {
  const operatorList = allOperatorList.filter((c) => c.marketplace === marketplace);
  const result = await getMarketplaceBlacklistFromDB(contract);
  return operatorList.some((c) => result.includes(c.address));
};

export const getMarketplaceBlacklist = async (contract: string): Promise<string[]> => {
  const c = new Contract(
    Sdk.SeaportBase.Addresses.OperatorFilterRegistry[config.chainId],
    new Interface([
      "function filteredOperators(address registrant) external view returns (address[] memory)",
    ]),
    baseProvider
  );

  const operators = await c.filteredOperators(contract);
  return operators.map((o: string) => o.toLowerCase());
};

export const getMarketplaceBlacklistFromDB = async (contract: string): Promise<string[]> => {
  const result = await redb.oneOrNone(
    `
      SELECT
        contracts.filtered_operators
      FROM contracts
      WHERE contracts.address = $/contract/
    `,
    { contract: toBuffer(contract) }
  );

  return result?.filtered_operators || [];
};

export const updateMarketplaceBlacklist = async (contract: string) => {
  const blacklist = await getMarketplaceBlacklist(contract);
  await idb.none(
    `
      UPDATE contracts
        SET filtered_operators = $/blacklist:json/
      WHERE contracts.address = $/contract/
    `,
    {
      contract: toBuffer(contract),
      blacklist,
    }
  );
};

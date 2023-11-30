import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";

import { baseProvider } from "@/common/provider";
import { CollectionMint } from "@/orderbook/mints";
import { now } from "@/common/utils";
import { config } from "@/config/index";
import { BigNumber } from "ethers";
import { Transaction } from "@/models/transactions";

const STANDARD = "titlesxyz";

/*
  Network: ZORA

  Factory: 0xAb359D0Eac42f94fd512f0a98D16Bf60D512CE72
  event EditionPublished(
      address indexed creator,
      address remixContractAddress,
      address creatorProceedRecipient,
      address derivativeFeeRecipient
  );

  EditionsV1:
  function purchase(uint256 quantity) external payable;

  Non editable:
  function price() external view (uint256)
  function maxSupply() external view (uint256)
  function mintLimitPerWallet() external view (uint256)
  function saleEndTime() external view (uint256)
*/

export const extractByCollectionERC721 = async (collection: string): Promise<CollectionMint[]> => {
  const results: CollectionMint[] = [];

  // we will need info from collection about the projectId
  const contract = new Contract(
    collection,
    new Interface([
      "function price() external view returns (uint256)",
      "function maxSupply() external view returns (uint256)",
      "function mintLimitPerWallet() external view returns (uint256)",
      "function saleEndTime() external view returns (uint256)",
      "function DERIVATIVE_FEE() external view returns (uint256)",
    ]),
    baseProvider
  );

  const [price, maxSupply, mintLimitPerWallet, endTime, derivativeFee]: [
    BigNumber,
    string,
    string,
    number,
    BigNumber
  ] = await Promise.all([
    contract.price(),
    contract.maxSupply().then((res: BigNumber) => res.toString()),
    contract.mintLimitPerWallet().then((res: BigNumber) => res.toString()),
    contract.saleEndTime().then((res: BigNumber) => res.toNumber()),
    contract.DERIVATIVE_FEE(),
  ]);

  const endPrice = price.add(derivativeFee).toString();

  const isOpen = endTime < now();

  results.push({
    collection,
    contract: collection,
    stage: `public-sale-${collection}`,
    kind: "public",
    status: isOpen ? "open" : "closed",
    standard: STANDARD,
    details: {
      tx: {
        to: collection,
        data: {
          // "purchase"
          signature: "0xefef39a1",
          params: [
            {
              kind: "quantity",
              abiType: "uint256",
            },
          ],
        },
      },
    },
    currency: Sdk.Common.Addresses.Native[config.chainId],
    price: endPrice,
    maxSupply: maxSupply === "0" ? undefined : maxSupply,
    maxMintsPerWallet: mintLimitPerWallet === "0" ? undefined : mintLimitPerWallet,
    endTime: endTime == 0 ? undefined : endTime,
  });

  return results;
};

export const extractByTx = async (
  collection: string,
  tx: Transaction
): Promise<CollectionMint[]> => {
  const iface = new Interface(["function purchase(uint256 quantity) external payable"]);

  const result = iface.parseTransaction({ data: tx.data });
  if (result) {
    return extractByCollectionERC721(collection);
  }

  return [];
};

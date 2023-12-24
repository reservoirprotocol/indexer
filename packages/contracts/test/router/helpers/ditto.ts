import { Contract } from "@ethersproject/contracts";
import { ethers } from "hardhat";

import { getChainId } from "../../utils";

import * as Sdk from "@reservoir0x/sdk/src";
import Erc20Abi from "@reservoir0x/sdk/src/common/abis/Erc20.json";
import Erc721Abi from "@reservoir0x/sdk/src/common/abis/Erc721.json";
import DittoPoolFactoryAbi from "@reservoir0x/sdk/src/ditto/abis/DittoPoolFactory.json";

export const getDittoContracts = () => {
  const chainId = getChainId();

  const testNftAddress = ethers.utils.getAddress(Sdk.Ditto.Addresses.Test721[chainId]);
  const nft = new Contract(testNftAddress, Erc721Abi, ethers.provider);

  const mintStanza = [
    {
      inputs: [
        {
          internalType: "address",
          name: "to",
          type: "address",
        },
        {
          internalType: "uint256",
          name: "idOrAmount",
          type: "uint256",
        },
      ],
      name: "mint",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
  ];

  const mintableTokenAbi = [...Erc20Abi, ...mintStanza];

  const testTokenAddress = ethers.utils.getAddress(Sdk.Ditto.Addresses.Test20[chainId]);
  const token: Contract = new Contract(testTokenAddress, mintableTokenAbi, ethers.provider);

  const dittoPoolFactoryAddress = ethers.utils.getAddress(
    Sdk.Ditto.Addresses.DittoPoolFactory[chainId]
  );
  const dittoPoolFactory: Contract = new Contract(
    dittoPoolFactoryAddress,
    DittoPoolFactoryAbi,
    ethers.provider
  );

  return { nft, token, dittoPoolFactory };
};

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";
import { Network } from "@reservoir0x/sdk/dist/utils";
import { ethers } from "ethers";

const erc721Interface = new ethers.utils.Interface([
  "function supportsInterface(bytes4 interfaceId) view returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
]);

const erc1155Interface = new ethers.utils.Interface([
  "function supportsInterface(bytes4 interfaceId) view returns (bool)",
  "function balanceOf(address account, uint256 id) view returns (uint256)",
]);

export async function detectTokenStandard(contractAddress: string) {
  const contract = new ethers.Contract(
    contractAddress,
    [...erc721Interface.fragments, ...erc1155Interface.fragments],
    baseProvider
  );

  try {
    if (config.chainId === Network.Optimism) {
      logger.info(
        "onchain-fetcher-contract-deployed",
        JSON.stringify({
          topic: "debugTokenStandard",
          message: `Start. contractAddress=${contractAddress}`,
        })
      );
    }
    const erc721Supported = await contract.supportsInterface("0x80ac58cd");
    const erc1155Supported = await contract.supportsInterface("0xd9b67a26");

    if (erc721Supported && !erc1155Supported) {
      return "ERC721";
    } else if (!erc721Supported && erc1155Supported) {
      return "ERC1155";
    } else if (erc721Supported && erc1155Supported) {
      return "Both";
    } else {
      return "Unknown";
    }
  } catch (error) {
    return "Unknown";
  }
}

export async function getContractNameAndSymbol(contractAddress: string) {
  const contract = new ethers.Contract(
    contractAddress,
    ["function name() view returns (string)", "function symbol() view returns (string)"],
    baseProvider
  );

  try {
    const [name, symbol] = await Promise.all([contract.name(), contract.symbol()]);
    return { name, symbol };
  } catch (error) {
    logger.error(
      "onchain-fetcher",
      `getContractName error. contractAddress:${contractAddress}, error:${error}`
    );

    return {
      name: null,
      symbol: null,
    };
  }
}

export async function getContractDeployer(contractAddress: string) {
  const contract = new ethers.Contract(
    contractAddress,
    ["function owner() view returns (address)"],
    baseProvider
  );

  try {
    const deployer = await contract.getDeployer();
    return deployer;
  } catch (error) {
    logger.error(
      "onchain-fetcher",
      `getContractDeployer error. contractAddress:${contractAddress}, error:${error}`
    );

    return null;
  }
}

import { Interface } from "@ethersproject/abi";
import { Log } from "@ethersproject/abstract-provider";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";

import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";
import * as nftxV3 from "@/events-sync/data/nftx-v3";
import {
  getNftxV3FtPool,
  getNftxV3NftPool,
  saveNftxV3FtPool,
  saveNftxV3NftPool,
} from "@/models/nftx-v3-pools";

const ifaceNftxV3 = new Interface([
  `event Swap(
    address indexed sender,
    address indexed recipient,
    int256 amount0,
    int256 amount1,
    uint160 sqrtPriceX96,
    uint128 liquidity,
    int24 tick
  )`,
]);

export const getNftPoolDetails = async (address: string, skipOnChainCheck = false) =>
  getNftxV3NftPool(address).catch(async () => {
    if (!skipOnChainCheck && Sdk.NftxV3.Addresses.VaultFactory[config.chainId]) {
      const iface = new Interface([
        "function assetAddress() view returns (address)",
        "function vaultId() view returns (uint256)",
        "function vault(uint256) view returns (address)",
      ]);

      try {
        const pool = new Contract(address, iface, baseProvider);

        const nft = (await pool.assetAddress()).toLowerCase();
        const vaultId = await pool.vaultId();

        const factory = new Contract(
          Sdk.NftxV3.Addresses.VaultFactory[config.chainId],
          iface,
          baseProvider
        );
        if ((await factory.vault(vaultId)).toLowerCase() === address) {
          return saveNftxV3NftPool({
            address,
            nft,
            vaultId: vaultId.toString(),
          });
        }
      } catch {
        // Skip any errors
      }
    }
  });

export const getFtPoolDetails = async (
  address: string,
  skipOnChainCheck = false,
  kind: "nftx-v3"
) =>
  getNftxV3FtPool(address).catch(async () => {
    if (!skipOnChainCheck && Sdk.NftxV3.Addresses.VaultFactory[config.chainId]) {
      const iface = new Interface([
        "function token0() view returns (address)",
        "function token1() view returns (address)",
      ]);

      try {
        const pool = new Contract(address, iface, baseProvider);

        const token0 = (await pool.token0()).toLowerCase();
        const token1 = (await pool.token1()).toLowerCase();

        return saveNftxV3FtPool({
          address,
          token0,
          token1,
          kind,
        });
      } catch {
        // Skip any errors
      }
    }
  });

export const isMint = (log: Log, address: string) => {
  if (
    log.topics[0] === nftxV3.minted.abi.getEventTopic("Minted") &&
    log.address.toLowerCase() === address
  ) {
    return true;
  }
  return false;
};

export const isRedeem = (log: Log, address: string) => {
  if (
    log.topics[0] === nftxV3.redeemed.abi.getEventTopic("Redeemed") &&
    log.address.toLowerCase() === address
  ) {
    return true;
  }
  return false;
};

export const isSwap = (log: Log) => {
  if ([ifaceNftxV3.getEventTopic("Swap")].includes(log.topics[0])) {
    return true;
  }
  return false;
};

export const tryParseSwap = async (log: Log) => {
  if (log.topics[0] === ifaceNftxV3.getEventTopic("Swap")) {
    const ftPool = await getFtPoolDetails(log.address.toLowerCase(), false, "nftx-v3");
    if (ftPool) {
      const parsedLog = ifaceNftxV3.parseLog(log);
      const rawAmount0 = parsedLog.args["amount0"].toString();
      const rawAmount1 = parsedLog.args["amount1"].toString();

      // Generate v2-style output
      const amount0Out = rawAmount0.includes("-");
      const amount1Out = rawAmount1.includes("-");
      const amount0 = amount0Out ? rawAmount0.split("-")[1] : rawAmount0;
      const amount1 = amount1Out ? rawAmount1.split("-")[1] : rawAmount1;

      return {
        ftPool,
        amount0Out: amount0Out ? amount0 : "0",
        amount1Out: amount1Out ? amount1 : "0",
        amount0In: !amount0Out ? amount0 : "0",
        amount1In: !amount1Out ? amount1 : "0",
      };
    }
  }
};

import { Interface } from "@ethersproject/abi";
import { Log } from "@ethersproject/abstract-provider";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";
import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";
import * as nftx from "@/events-sync/data/nftx";
import {
  getNftxFtPool,
  getNftxNftPool,
  saveNftxFtPool,
  saveNftxNftPool,
} from "@/models/nftx-pools";

export const getNftPoolDetails = async (address: string) =>
  getNftxNftPool(address).catch(async () => {
    if (Sdk.Nftx.Addresses.VaultFactory[config.chainId]) {
      const iface = new Interface([
        "function assetAddress() view returns (address)",
        "function vaultId() view returns (uint256)",
        "function vault(uint256) view returns (address)",
      ]);

      try {
        const pool = new Contract(address, iface, baseProvider);

        const nft = await pool.assetAddress();
        const vaultId = await pool.vaultId();

        const factory = new Contract(
          Sdk.Nftx.Addresses.VaultFactory[config.chainId],
          iface,
          baseProvider
        );
        if ((await factory.vault(vaultId)).toLowerCase() === address) {
          return saveNftxNftPool({
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

export const getFtPoolDetails = async (address: string) =>
  getNftxFtPool(address).catch(async () => {
    if (Sdk.Nftx.Addresses.VaultFactory[config.chainId]) {
      const iface = new Interface([
        "function token0() view returns (address)",
        "function token1() view returns (address)",
      ]);

      try {
        const pool = new Contract(address, iface, baseProvider);

        const token0 = await pool.token0();
        const token1 = await pool.token1();

        return saveNftxFtPool({
          address,
          token0,
          token1,
        });
      } catch {
        // Skip any errors
      }
    }
  });

export const isMint = (log: Log, address: string) => {
  if (
    log.topics[0] === nftx.minted.abi.getEventTopic("Minted") &&
    log.address.toLowerCase() === address
  ) {
    return true;
  }
};

export const isRedeem = (log: Log, address: string) => {
  if (
    log.topics[0] === nftx.redeemed.abi.getEventTopic("Redeemed") &&
    log.address.toLowerCase() === address
  ) {
    return true;
  }
};

const ifaceUniV2 = new Interface([
  `event Swap(
    address indexed sender,
    uint256 amount0In,
    uint256 amount1In,
    uint256 amount0Out,
    uint256 amount1Out,
    address indexed to
  )`,
]);
const ifaceUniV3 = new Interface([
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

export const isSwap = (log: Log) => {
  if (
    [ifaceUniV2.getEventTopic("Swap"), ifaceUniV3.getEventTopic("Swap")].includes(log.topics[0])
  ) {
    return true;
  }
  return false;
};

export const tryParseSwap = async (log: Log) => {
  // We only support parsing UniswapV2-like swaps for now

  // TODO: Add support for UniswapV3-like swaps and multi-swaps
  // (eg. https://etherscan.io/tx/0x04cc2def87437c608f743ab0bfe90d4a80997cd7e6c0503e6472bb3dd084a167)

  if (log.topics[0] === ifaceUniV2.getEventTopic("Swap")) {
    const ftPool = await getFtPoolDetails(log.address.toLowerCase());
    if (ftPool) {
      const parsedLog = ifaceUniV2.parseLog(log);
      return {
        ftPool,
        amount0In: parsedLog.args["amount0In"].toString(),
        amount1In: parsedLog.args["amount1In"].toString(),
        amount0Out: parsedLog.args["amount0Out"].toString(),
        amount1Out: parsedLog.args["amount1Out"].toString(),
      };
    }
  }
};

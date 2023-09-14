import { Interface } from "@ethersproject/abi";
import { AddressZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";

import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";
import { getSudoswapPool, saveSudoswapPool } from "@/models/sudoswap-pools";

export const getPoolDetails = async (address: string) =>
  getSudoswapPool(address).catch(async () => {
    if (Sdk.Sudoswap.Addresses.PairFactory[config.chainId]) {
      const iface = new Interface([
        "function nft() view returns (address)",
        "function token() view returns (address)",
        "function bondingCurve() view returns (address)",
        "function poolType() view returns (uint8)",
        "function pairVariant() view returns (uint8)",
        "function isPair(address pair, uint8 variant) view returns (bool)",
      ]);

      try {
        const pool = new Contract(address, iface, baseProvider);

        const nft = (await pool.nft()).toLowerCase();
        const bondingCurve = (await pool.bondingCurve()).toLowerCase();
        const poolKind = await pool.poolType();
        const pairKind = await pool.pairVariant();
        const token = pairKind > 1 ? (await pool.token()).toLowerCase() : AddressZero;

        const factory = new Contract(
          Sdk.Sudoswap.Addresses.PairFactory[config.chainId],
          iface,
          baseProvider
        );
        if (await factory.isPair(address, pairKind)) {
          return saveSudoswapPool({
            address,
            nft,
            token,
            bondingCurve,
            poolKind,
            pairKind,
          });
        }
      } catch {
        // Skip any errors
      }
    }
  });

import { Interface } from "@ethersproject/abi";
import { AddressZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";

import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";
import { getSudoswapV2Pool, saveSudoswapV2Pool } from "@/models/sudoswap-v2-pools";

export const getPoolDetails = async (address: string) =>
  getSudoswapV2Pool(address).catch(async () => {
    if (Sdk.SudoswapV2.Addresses.PairFactory[config.chainId]) {
      const iface = new Interface([
        "function nft() view returns (address)",
        "function token() view returns (address)",
        "function bondingCurve() view returns (address)",
        "function poolType() view returns (uint8)",
        "function pairVariant() view returns (uint8)",
        "function isValidPair(address pairAddress) view returns (bool)",
        "function nftId() view returns (uint256)",
        "function propertyChecker() view returns (address)",
      ]);

      try {
        const pool = new Contract(address, iface, baseProvider);
        const nft = (await pool.nft()).toLowerCase();
        const bondingCurve = (await pool.bondingCurve()).toLowerCase();
        const poolKind = await pool.poolType();
        const pairKind = await pool.pairVariant();
        const token =
          pairKind == 1 || pairKind == 3 ? (await pool.token()).toLowerCase() : AddressZero;

        // Only relevant for ERC1155 orders
        let tokenId: string | undefined = undefined;
        if (pairKind > 1) {
          tokenId = (await pool.nftId()).toString();
        }

        let propertyChecker = AddressZero;
        try {
          propertyChecker = (await pool.propertyChecker()).toLowerCase();
        } catch {
          // Skip errors
        }

        const factory = new Contract(
          Sdk.SudoswapV2.Addresses.PairFactory[config.chainId],
          iface,
          baseProvider
        );
        if (await factory.isValidPair(address)) {
          return saveSudoswapV2Pool({
            address,
            nft,
            token,
            bondingCurve,
            poolKind,
            pairKind,
            propertyChecker,
            tokenId,
          });
        }
      } catch {
        // Skip any errors
      }
    }
  });

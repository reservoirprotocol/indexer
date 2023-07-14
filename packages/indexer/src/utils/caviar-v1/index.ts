import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import { baseProvider } from "@/common/provider";

export const getPoolDetails = async (address: string) => {
  const iface = new Interface([
    "function nft() view returns (address)",
    "function baseToken() view returns (address)",
    "function merkleRoot() view returns (bytes32)",
  ]);

  const pool = new Contract(address, iface, baseProvider);

  const nft = await pool.nft().then((v: string) => v.toLowerCase());
  const baseToken = await pool.baseToken().then((v: string) => v.toLowerCase());
  const merkleRoot = await pool.merkleRoot();

  return { nft, baseToken, merkleRoot, address };
};

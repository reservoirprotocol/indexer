import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { extractByTx } from "../../orderbook/mints/calldata/detector/generic";
import { jest, describe, it, expect } from "@jest/globals";
import * as utils from "@/events-sync/utils";
import { BigNumber } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { config } from "@/config/index";
import { simulateCollectionMint } from "@/orderbook/mints/simulation";
// import { defaultAbiCoder } from "@ethersproject/abi";

jest.setTimeout(1000 * 1000);

describe("Mints - Generic", () => {
  // 0x27f532b44bd73d57c741b384389760f799641a5d
  it("arguments-with-zero-proof-case1", async () => {
    if (config.chainId != 1) {
      return;
    }
    const transcation = await utils.fetchTransaction(
      "0xe807f892fcfd93dc33c7f839231da9fde455b810cf37b2b214befd8b5b84c78f"
    );
    // Mint.dot fun
    // parsed:
    // mint(auth = {"key":"0x0000000000000000000000000000000000000000000000000000000000000000","proof":[]}, _count = 1)
    const infos = await extractByTx(
      "0x27f532b44bd73d57c741b384389760f799641a5d",
      transcation,
      BigNumber.from("0"),
      BigNumber.from("1")
    );

    // console.log(
    //   defaultAbiCoder.encode(
    //     ["(bytes32,bytes32[])"],
    //     [["0x0000000000000000000000000000000000000000000000000000000000000000", []]]
    //   )
    // );

    // console.log("infos", infos);
    expect(infos.length).not.toBe(0);
  });

  // 0x0d0f3d4f1824737a6f215828cea05376426fef50
  it("arguments-with-zero-proof-case2", async () => {
    if (config.chainId != 1) {
      return;
    }
    const collection = "0x0d0f3d4f1824737a6f215828cea05376426fef50";
    const tx = "0x8d2b8379d5564acdbe7051696554c43f9f9b9a047abbecf645521ba04846097a";
    const transcation = await utils.fetchTransaction(tx);
    // ABI: purchaseBlueprints(uint32 purchaseQuantity,uint32 whitelistedQuantity,uint256 tokenAmount,bytes32[] proof)
    // type: purchaseBlueprints(purchaseQuantity=1, whitelistedQuantity=1, tokenAmount=0, proof=['0x0000000000000000000000000000000000000000000000000000000000000000'])
    const infos = await extractByTx(
      collection,
      transcation,
      parseEther("0.069"),
      BigNumber.from("1")
    );
    // console.log("infos", infos);
    expect(infos.length).not.toBe(0);
  });

  // 0x26be58c4533fb341010ce0e7973e36d28fbb3612
  it("mainnet-normal", async () => {
    if (config.chainId != 1) {
      return;
    }
    const collection = "0x26be58c4533fb341010ce0e7973e36d28fbb3612";
    const tx = "0xc011128f7db843565b06fd6a9ac64973608b08b17d7282856cc9e5f14628737c";
    const transcation = await utils.fetchTransaction(tx);
    const infos = await extractByTx(
      collection,
      transcation,
      parseEther("048"),
      BigNumber.from("1")
    );
    expect(infos.length).not.toBe(0);
  });

  it("base-normal-case1", async () => {
    if (config.chainId != 8453) {
      return;
    }
    const collection = "0xd1758c96e8bf67f2d8e9a250aeaf189a79f2784e";
    const tx = "0xc8b54c635a4f08994ba5a8bf8ef4fc2d4972ea1bde5ccab2b8d8f445c439ee38";
    const transcation = await utils.fetchTransaction(tx);
    const infos = await extractByTx(
      collection,
      transcation,
      parseEther("0.000099"),
      BigNumber.from("10")
    );
    expect(infos.length).not.toBe(0);
  });

  it("base-normal-case2", async () => {
    if (config.chainId != 8453) {
      return;
    }
    const collection = "0xb43159cf582dcf42cc8f833d4a5915361984bd20";
    const txId = "0x6df11da37db5748b97fb4c60fc807bcd6feff4659e8e498d99a07d1f5737f03a";
    const transcation = await utils.fetchTransaction(txId);
    const infos = await extractByTx(
      collection,
      transcation,
      parseEther("0.000099"),
      BigNumber.from("10")
    );
    expect(infos.length).not.toBe(0);
  });

  it("base-normal-case3", async () => {
    if (config.chainId != 8453) {
      return;
    }
    const collection = "0x0d39445faf8e7f7cc240f4e12ae3a7867eea2a67";
    const txId = "0x13dcd467192096bbd652d934dd0d7a40581bc6d39d38d9e8a874e7a77151d732";
    const transcation = await utils.fetchTransaction(txId);
    const collectionMints = await extractByTx(
      collection,
      transcation,
      parseEther("0.000099"),
      BigNumber.from("10")
    );

    // for (const collectionMint of collectionMints) {
    //   const result = await simulateCollectionMint(collectionMint);
    //   console.log("result", result);
    // }

    expect(collectionMints.length).not.toBe(0);
  });

  it("guess-constant-arguments-from-complex-arguments-by-multiple-mint-txs", async () => {
    if (config.chainId != 10) {
      return;
    }
    const collection = "0x513a87ab60777a306b6c40e3585d2bc4aea9ff52";
    const txId = "0x36cf609d3607cf247c2f240374c868690a100b6a21c2f23336e840aad1ac0756";
    const transcation = await utils.fetchTransaction(txId);
    const collectionMints = await extractByTx(
      collection,
      transcation,
      parseEther("0"),
      BigNumber.from("1"),
      [
        await utils.fetchTransaction(
          "0xfdf21e75d937fb33be24498e123d5f52a8de10e0bf8ef4f56d88b68a6ee87e47"
        ),
        await utils.fetchTransaction(
          "0xc4977c26ef33524972bb7430442ba6b6aa111b015c2b8fe6554c57186f74d499"
        ),
      ]
    );

    for (const collectionMint of collectionMints) {
      if (collectionMint.status === "open") {
        const result = await simulateCollectionMint(collectionMint);
        expect(result).toBe(true);
      }
    }
    expect(collectionMints.length).not.toBe(0);
  });
});

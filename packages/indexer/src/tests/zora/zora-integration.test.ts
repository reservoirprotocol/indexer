import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();
import { baseProvider } from "@/common/provider";
import { wait } from "../utils/test";
import { keccak256 } from "@ethersproject/solidity";
import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import { Wallet } from "@ethersproject/wallet";
import { Zora } from "@reservoir0x/sdk";
import { config } from "@/config/index";
import { parseEther } from "@ethersproject/units";
import { ethers } from "ethers";
import { idb } from "@/common/db";
import {
  testNFTAddr,
  operator,
  operator2,
  operatorKey,
  operator2Key,
} from "./__fixtures__/test-accounts";
// import { toBuffer } from "@/common/utils";

const operatorProvider = new Wallet(operatorKey, baseProvider);
const operator2Provider = new Wallet(operator2Key, baseProvider);

jest.setTimeout(600 * 1000);

describe("ZoraTestnet", () => {
  const tokenId = "1";
  const chainId = config.chainId;
  // test NFT contract
  const nftToken = new Contract(
    testNFTAddr,
    new Interface([
      "function safeMint(address to) public",
      "function balanceOf(address owner) public view returns(uint256)",
      "function ownerOf(uint256 _tokenId) external view returns (address)",
      "function setApprovalForAll(address _operator, bool _approved) external",
      "function transferFrom(address _from, address _to, uint256 _tokenId) external payable",
      "function isApprovedForAll(address _owner, address _operator) external view returns (bool)",
    ]),
    operatorProvider
  );

  const indexInterval = 40 * 1000;
  const orderId = keccak256(
    ["string", "string", "uint256"],
    ["zora-v3", `${testNFTAddr}`, `${tokenId}`]
  );

  test("create-order", async () => {
    const seller = operatorProvider;
    const balance = await nftToken.balanceOf(operator);
    const currentOwner = await nftToken.ownerOf(tokenId);
    // send back NFT
    if (currentOwner === operator2) {
      const backTx = await nftToken
        .connect(operator2Provider)
        .transferFrom(operator2Provider.address, operatorProvider.address, tokenId);
      await backTx.wait();
    }

    if (balance.toString() === "0") {
      const tx = await nftToken.safeMint(operator);
      await tx.wait();
    }

    const exchange = new Zora.Exchange(chainId);
    const moduleManager = new Zora.ModuleManager(chainId);

    // Approve the exchange for escrowing.
    const isApproved = await nftToken.isApprovedForAll(
      seller.address,
      Zora.Addresses.Erc721TransferHelper[chainId]
    );

    if (!isApproved) {
      await moduleManager.setApprovalForModule(seller, Zora.Addresses.Exchange[chainId], true);
      const tx = await nftToken.setApprovalForAll(
        Zora.Addresses.Erc721TransferHelper[chainId],
        true
      );
      await tx.wait();
    }

    const owner = await nftToken.ownerOf(tokenId);
    expect(owner).toEqual(seller.address);

    const price = parseEther("0.005");

    // Create sell order.
    const order = new Zora.Order(chainId, {
      tokenContract: testNFTAddr,
      tokenId,
      askPrice: price.toString(),
      askCurrency: ethers.constants.AddressZero,
      sellerFundsRecipient: seller.address,
      findersFeeBps: 0,
    });

    const creatTx = await exchange.createOrder(seller, order);
    await creatTx.wait();

    await wait(indexInterval);

    const dbOrder = await idb.oneOrNone(
      `SELECT fillability_status FROM "orders" "o" WHERE "o"."id" = $/id/`,
      {
        id: orderId,
      }
    );

    expect(dbOrder?.fillability_status).toEqual("fillable");
  });

  test("balance-change", async () => {
    // const nftBalance1 = await idb.oneOrNone(
    //   `SELECT amount FROM "nft_balances" "o" WHERE "o"."owner" = $/maker/`,
    //   {
    //     id: orderId,
    //     maker: toBuffer(operatorProvider.address),
    //     contract: toBuffer(testNFTAddr),
    //     tokenId: tokenId,
    //   }
    // );

    const tokenOwner = await nftToken.ownerOf(tokenId);
    const indexInterval = 40 * 1000;
    if (tokenOwner == operatorProvider.address) {
      const tx = await nftToken
        .connect(operatorProvider)
        .transferFrom(operatorProvider.address, operator2Provider.address, tokenId);
      await tx.wait();
      await wait(indexInterval);
    }

    // const nftBalance = await idb.oneOrNone(
    //   `SELECT amount FROM "nft_balances" "o" WHERE "o"."owner" = $/maker/`,
    //   {
    //     id: orderId,
    //     maker: toBuffer(operatorProvider.address),
    //     contract: toBuffer(testNFTAddr),
    //     tokenId: tokenId,
    //   }
    // );

    // console.log("nftBalance", nftBalance);

    const order = await idb.oneOrNone(
      `SELECT fillability_status FROM "orders" "o" WHERE "o"."id" = $/id/`,
      {
        id: orderId,
      }
    );

    const backTx = await nftToken
      .connect(operator2Provider)
      .transferFrom(operator2Provider.address, operatorProvider.address, tokenId);
    await backTx.wait();

    await wait(indexInterval);

    const orderAfter = await idb.oneOrNone(
      `SELECT fillability_status FROM "orders" "o" WHERE "o"."id" = $/id/`,
      {
        id: orderId,
      }
    );

    // const nftBalance2 = await idb.oneOrNone(
    //   `SELECT amount FROM "nft_balances" "o" WHERE "o"."owner" = $/maker/`,
    //   {
    //     id: orderId,
    //     maker: toBuffer(operatorProvider.address),
    //     contract: toBuffer(testNFTAddr),
    //     tokenId: tokenId,
    //   }
    // );

    expect(order?.fillability_status).toEqual("no-balance");
    expect(orderAfter?.fillability_status).toEqual("fillable");
  });

  test("approval-change", async () => {
    const indexInterval = 30 * 1000;

    const cancelTx = await nftToken
      .connect(operatorProvider)
      .setApprovalForAll(Zora.Addresses.Erc721TransferHelper[chainId], false);
    await cancelTx.wait();

    await wait(indexInterval);

    const order = await idb.oneOrNone(
      `SELECT fillability_status, approval_status FROM "orders" "o" WHERE "o"."id" = $/id/`,
      {
        id: orderId,
      }
    );

    const approvalTx = await nftToken
      .connect(operatorProvider)
      .setApprovalForAll(Zora.Addresses.Erc721TransferHelper[chainId], true);
    await approvalTx.wait();

    await wait(indexInterval);

    const orderAfter = await idb.oneOrNone(
      `SELECT fillability_status, approval_status FROM "orders" "o" WHERE "o"."id" = $/id/`,
      {
        id: orderId,
      }
    );

    expect(order?.approval_status).toEqual("no-approval");
    expect(orderAfter?.approval_status).toEqual("approved");
  });

  test("cancel-order", async () => {
    const seller = operatorProvider;
    const order = new Zora.Order(chainId, {
      tokenContract: testNFTAddr,
      tokenId,
      askPrice: "0",
      askCurrency: ethers.constants.AddressZero,
      sellerFundsRecipient: seller.address,
      findersFeeBps: 0,
    });

    const exchange = new Zora.Exchange(chainId);
    const cancelTxt = await exchange.cancelOrder(seller, order);
    await cancelTxt.wait();

    await wait(indexInterval);
    const dbOrder = await idb.oneOrNone(
      `SELECT fillability_status, approval_status FROM "orders" "o" WHERE "o"."id" = $/id/`,
      {
        id: orderId,
      }
    );
    // console.log("dbOrder", dbOrder);
    expect(dbOrder?.fillability_status).toEqual("cancelled");
  });

  test("update-order", async () => {
    const price = parseEther("0.002");
    const order = new Zora.Order(chainId, {
      tokenContract: testNFTAddr,
      tokenId,
      askPrice: price.toString(),
      askCurrency: ethers.constants.AddressZero,
      sellerFundsRecipient: operatorProvider.address,
      findersFeeBps: 0,
    });

    const exchange = new Zora.Exchange(chainId);
    const updateTx = await operatorProvider.sendTransaction({
      from: operatorProvider.address,
      to: exchange.contract.address,
      data: exchange.contract.interface.encodeFunctionData("setAskPrice", [
        order.params.tokenContract,
        order.params.tokenId,
        order.params.askPrice,
        order.params.askCurrency,
      ]),
    });

    await updateTx.wait();
    await wait(indexInterval);

    const dbOrder = await idb.oneOrNone(
      `SELECT fillability_status, approval_status, price FROM "orders" "o" WHERE "o"."id" = $/id/`,
      {
        id: orderId,
      }
    );

    // console.log("dbOrder", dbOrder)
    expect(dbOrder?.price).toEqual(price.toString());
  });

  test("update-order-invalid-currency", async () => {
    const price = parseEther("0.002");
    const order = new Zora.Order(chainId, {
      tokenContract: testNFTAddr,
      tokenId,
      askPrice: price.toString(),
      // askCurrency: ethers.constants.AddressZero,
      askCurrency: "0x5ffbac75efc9547fbc822166fed19b05cd5890bb",
      sellerFundsRecipient: operatorProvider.address,
      findersFeeBps: 0,
    });

    const exchange = new Zora.Exchange(chainId);
    const updateTx = await operatorProvider.sendTransaction({
      from: operatorProvider.address,
      to: exchange.contract.address,
      data: exchange.contract.interface.encodeFunctionData("setAskPrice", [
        order.params.tokenContract,
        order.params.tokenId,
        order.params.askPrice,
        order.params.askCurrency,
      ]),
    });

    await updateTx.wait();
    await wait(indexInterval);

    const dbOrder = await idb.oneOrNone(
      `SELECT fillability_status, approval_status, price FROM "orders" "o" WHERE "o"."id" = $/id/`,
      {
        id: orderId,
      }
    );

    // console.log("dbOrder", dbOrder)
    expect(dbOrder?.fillability_status).toEqual("cancelled");
  });

  test("fill-order", async () => {
    const price = parseEther("0.002");
    const order = new Zora.Order(chainId, {
      tokenContract: testNFTAddr,
      tokenId,
      askPrice: price.toString(),
      askCurrency: ethers.constants.AddressZero,
      sellerFundsRecipient: operatorProvider.address,
      findersFeeBps: 0,
    });

    const exchange = new Zora.Exchange(chainId);
    await exchange.fillOrder(operator2Provider, order);
    await wait(indexInterval);

    const dbOrder = await idb.oneOrNone(
      `SELECT fillability_status, approval_status, price FROM "orders" "o" WHERE "o"."id" = $/id/`,
      {
        id: orderId,
      }
    );

    // console.log("dbOrder", dbOrder)
    expect(dbOrder?.fillability_status).toEqual("filled");
  });
});

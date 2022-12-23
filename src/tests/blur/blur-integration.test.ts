import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();
import { baseProvider } from "@/common/provider";
import { wait, saveContract } from "../utils/test";
import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import { Wallet } from "@ethersproject/wallet";
import { Blur, Common } from "@reservoir0x/sdk";
import { config } from "@/config/index";
import { parseEther } from "@ethersproject/units";
import * as orders from "@/orderbook/orders";
import { logger } from "@/common/logger";

import {
  testNFTAddr,
  operatorKey,
  operator2Key,
  BLUR_DEPLOYER_KEY,
} from "../element/__fixtures__/test-accounts";
import axios from "axios";
import { setupNFTs } from "../utils/nft";
import { getOrder } from "../utils/order";

const operatorProvider = new Wallet(operatorKey, baseProvider);
const operator2Provider = new Wallet(operator2Key, baseProvider);
const BLUR_ORACLE = new Wallet(BLUR_DEPLOYER_KEY, baseProvider);

jest.setTimeout(1000 * 1000);

describe("BluTestnet", () => {
  const tokenId = 1;
  const chainId = config.chainId;
  const seller = operatorProvider;
  const buyer = operator2Provider;
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

  const operator = Blur.Addresses.ExecutionDelegate[config.chainId];

  const indexInterval = 120 * 1000;

  test("sellERC721", async () => {
    await setupNFTs(nftToken, seller, buyer, tokenId, operator);

    const exchange = new Blur.Exchange(chainId);
    const builder = new Blur.Builders.SingleToken(chainId);
    const price = parseEther("0.001");

    const hashNonce = await exchange.getNonce(baseProvider, seller.address);

    logger.info("BlurTestnet", `hashNonce=${hashNonce}`);

    // Build Sell order
    const sellOrder = builder.build({
      side: "sell",
      trader: seller.address,
      collection: nftToken.address,
      tokenId: tokenId,
      amount: 1,
      paymentToken: Common.Addresses.Eth[chainId],
      price,
      listingTime: Math.floor(Date.now() / 1000),
      matchingPolicy: Blur.Addresses.StandardPolicyERC721[chainId],
      nonce: hashNonce,
      expirationTime: Math.floor(Date.now() / 1000) + 86400,
      fees: [],
      salt: hashNonce,
      extraParams: "0x",
    });

    await sellOrder.sign(seller);

    const orderInfo: orders.blur.OrderInfo = {
      orderParams: sellOrder.params,
      metadata: {},
    };

    const orderId = sellOrder.hash();

    logger.info("BlurTestnet", `Save ${orderId} to database`);

    // Store order to database
    await orders.blur.save([orderInfo]);

    await wait(10 * 1000);

    const ordeStatus = await getOrder(orderId);
    logger.info("BlurTestnet", `Order status ${JSON.stringify(ordeStatus)}`);

    // Create matching buy order
    const buyOrder = sellOrder.buildMatching({
      trader: buyer.address,
    });

    // Fill order
    const fillTx = await exchange.fillOrder(buyer, sellOrder, buyOrder);

    logger.info("BlurTestnet", `Fill order=${orderId}, tx=${fillTx.hash}`);

    await fillTx.wait();

    logger.info("BlurTestnet", `Waiting... ${indexInterval}`);

    await wait(indexInterval);

    // Check order
    const orderAfter = await getOrder(orderId);
    logger.info("BlurTestnet", `Order status ${JSON.stringify(orderAfter)}`);
    expect(orderAfter?.fillability_status).toEqual("filled");
  });

  const testOracleSign = async (isBulk: boolean) => {
    await setupNFTs(nftToken, seller, buyer, tokenId, operator);

    const exchange = new Blur.Exchange(chainId);
    const builder = new Blur.Builders.SingleToken(chainId);
    const price = parseEther("0.001");

    const hashNonce = await exchange.getNonce(baseProvider, seller.address);

    logger.info("BlurTestnet", `hashNonce=${hashNonce}`);

    // Build Sell order
    const sellOrder = builder.build({
      side: "sell",
      trader: seller.address,
      collection: nftToken.address,
      tokenId: tokenId,
      amount: 1,
      paymentToken: Common.Addresses.Eth[chainId],
      price,
      matchingPolicy: Blur.Addresses.StandardPolicyERC721[chainId],
      nonce: hashNonce,
      listingTime: "0",
      expirationTime: "0",
      fees: [],
      salt: Math.floor(Math.random() * 1000) + "",
      extraParams: "0x",
      blockNumber: await baseProvider.getBlockNumber(),
    });

    if (isBulk) {
      await Blur.Order.signBulk([sellOrder], seller);
      await Blur.Order.signBulkOracle([sellOrder], BLUR_ORACLE);
    } else {
      await sellOrder.sign(seller);
      await sellOrder.oracleSign(BLUR_ORACLE);
    }

    sellOrder.checkSignature();
    const orderInfo: orders.blur.OrderInfo = {
      orderParams: sellOrder.params,
      metadata: {},
    };

    const orderId = sellOrder.hash();

    logger.info("BlurTestnet", `Save ${orderId} to database`);

    // Store order to database
    await orders.blur.save([orderInfo]);
    await wait(10 * 1000);

    const ordeStatus = await getOrder(orderId);
    logger.info("BlurTestnet", `Order status ${JSON.stringify(ordeStatus)}`);

    // Create matching buy order
    const buyOrder = sellOrder.buildMatching({
      trader: buyer.address,
    });

    // Fill order
    const fillTx = await exchange.fillOrder(buyer, sellOrder, buyOrder);

    logger.info("BlurTestnet", `Fill order=${orderId}, tx=${fillTx.hash}`);

    await fillTx.wait();

    logger.info("BlurTestnet", `Waiting... ${indexInterval}`);

    await wait(indexInterval);

    // Check order
    const orderAfter = await getOrder(orderId);
    logger.info("BlurTestnet", `Order status ${JSON.stringify(orderAfter)}`);
    expect(orderAfter?.fillability_status).toEqual("filled");
  };

  test("oracleSignSellERC721", async () => testOracleSign(false));
  test("oracleBulkSignSellERC721", async () => testOracleSign(true));

  test("oracleOrderValidate", async () => {
    const order = new Blur.Order(1, {
      trader: "0xFB20aDd8C2437cc3995E9CbC5800989C68b978Aa",
      side: 1,
      matchingPolicy: "0x0000000000daB4A563819e8fd93dbA3b25BC3495",
      collection: "0x201675fBFAAAC3A51371E4C31FF73Ac14ceE2A5A",
      tokenId: "3493",
      amount: "1",
      paymentToken: "0x0000000000000000000000000000000000000000",
      price: "54940000000000000",
      listingTime: "1670552115",
      expirationTime: "1670555715",
      fees: [],
      salt: "148762949126025792316946306399428517805",
      extraParams: "0x01",
      v: 27,
      r: "0x5269bc2dfe9a5ba610ef18dc6c006c25686f9a07e022786d55a1d0afedf82bb5",
      s: "0x2059e6729b3441ec752a67994cc9baed1e0906947d1f43a51435fb3c4455ada8",
      extraSignature:
        "0x000000000000000000000000000000000000000000000000000000000000001ca69e5155b951c966f5ed140ef7f027126d8e2f1ed6e78773e740652eb8397bbf521c29d4810a748e3260e14cd5dd06730486b8981f2a4e326cf452334b6fa8b2",
      signatureVersion: 0,
      blockNumber: 16144104,
      // "orderHash": "0x8b1b93625e4ac50cea2dd8d5d31e9595e15b7ea8a4e70289223c0f6c8769c615",
      nonce: "0",
    });
    order.checkSignature();
  });

  test("oracleOrderSaving", async () => {
    const order = new Blur.Order(1, {
      trader: "0x613101D75b96ED8c10b8e20429a03CdD8d9e082c",
      side: 1,
      matchingPolicy: "0x0000000000daB4A563819e8fd93dbA3b25BC3495",
      collection: "0xc26064Ac72101B555Ff2fCC1629a7A867B69c188",
      tokenId: "4299",
      amount: "1",
      paymentToken: "0x0000000000000000000000000000000000000000",
      price: "24900000000000000",
      listingTime: "1670556457",
      expirationTime: "1670560057",
      fees: [],
      salt: "291270979185784293046004051062393921192",
      extraParams: "0x01",
      v: 27,
      r: "0x716a75b0d66290263a70724f268fc458b9398a21faa4e3a6ba3f75bfb5242004",
      s: "0x60e5ba58a4c65fae3f1a3e691d30c194138ebd6a12670420c74205a105766c37",
      extraSignature:
        "0x000000000000000000000000000000000000000000000000000000000000001b3af3a78a2deaf129994bb433e1ab48b6d6d25d530c6fe460197e1eefb138cbe80e4f76ae2b575e98a0b8df293d2f59d4fdd09f348f1068af3329540f1bd7d581",
      signatureVersion: 0,
      blockNumber: 16144464,
      // "orderHash": "0x6f3bc41cf7062d2e0665a530fe2f776f2607f2d73260aafef887aabd395c9554",
      nonce: "0",
    });

    await saveContract(order.params.collection.toLowerCase(), "erc721");

    const orderInfo: orders.blur.OrderInfo = {
      orderParams: order.params,
      metadata: {},
    };

    const orderId = order.hash();
    logger.info("BlurTestnet", `Save ${orderId} to database`);
    // Store order to database
    await orders.blur.save([orderInfo]);

    await wait(10 * 1000);

    const ordeStatus = await getOrder(orderId);
    expect(ordeStatus).not.toBe(undefined);
  });

  test("buyERC721", async () => {
    await setupNFTs(nftToken, seller, buyer, tokenId, operator);

    const exchange = new Blur.Exchange(chainId);
    const builder = new Blur.Builders.SingleToken(chainId);
    const price = parseEther("0.001");

    const weth = new Common.Helpers.Weth(baseProvider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    const approveTx = await weth.approve(buyer, Blur.Addresses.ExecutionDelegate[chainId]);

    await approveTx.wait();

    await wait(20 * 1000);

    const hashNonce = await exchange.getNonce(baseProvider, buyer.address);

    logger.info("BlurTestnet", `hashNonce=${hashNonce}`);

    // Build Sell order
    const buyOrder = builder.build({
      side: "buy",
      trader: buyer.address,
      matchingPolicy: Blur.Addresses.StandardPolicyERC721[chainId],
      collection: nftToken.address,
      tokenId: tokenId,
      nonce: hashNonce,
      amount: "1",
      paymentToken: Common.Addresses.Weth[chainId],
      price,
      listingTime: Math.floor(Date.now() / 1000) - 86400,
      expirationTime: Math.floor(Date.now() / 1000) + 86400 * 7,
      extraParams: "0x",
      salt: 0,
      fees: [
        // {
        //   recipient: buyer.address,
        //   rate: 100, // 100/10000 = 0.01
        // }
      ],
    });

    await buyOrder.sign(buyer);
    await buyOrder.checkFillability(baseProvider);

    const orderInfo: orders.blur.OrderInfo = {
      orderParams: buyOrder.params,
      metadata: {},
    };

    const orderId = buyOrder.hash();

    logger.info("BlurTestnet", `Save ${orderId} to database`);

    // Store order to database
    await orders.blur.save([orderInfo]);

    await wait(10 * 1000);

    const ordeStatus = await getOrder(orderId);
    logger.info("BlurTestnet", `Order status ${JSON.stringify(ordeStatus)}`);

    // Create matching buy order
    const sellOrder = buyOrder.buildMatching({
      trader: seller.address,
      listingTime: Math.floor(Date.now() / 1000) - 86400,
      expirationTime: Math.floor(Date.now() / 1000) + 86400 * 7,
    });

    // Fill order
    const fillTx = await exchange.fillOrder(seller, buyOrder, sellOrder);

    logger.info("BlurTestnet", `Fill order=${orderId}, tx=${fillTx.hash}`);

    await fillTx.wait();

    logger.info("BlurTestnet", `Waiting... ${indexInterval}`);

    await wait(indexInterval);

    // Check order
    const orderAfter = await getOrder(orderId);
    logger.info("BlurTestnet", `Order status ${JSON.stringify(orderAfter)}`);
    expect(orderAfter?.fillability_status).toEqual("filled");
  });

  test("cancelSell", async () => {
    await setupNFTs(nftToken, seller, buyer, tokenId, operator);

    const exchange = new Blur.Exchange(chainId);
    const builder = new Blur.Builders.SingleToken(chainId);
    const price = parseEther("0.001");

    const hashNonce = await exchange.getNonce(baseProvider, seller.address);

    logger.info("BlurTestnet", `hashNonce=${hashNonce}`);

    // Build Sell order
    const sellOrder = builder.build({
      side: "sell",
      trader: seller.address,
      collection: nftToken.address,
      tokenId: tokenId,
      amount: 1,
      paymentToken: Common.Addresses.Eth[chainId],
      price,
      listingTime: Math.floor(Date.now() / 1000),
      matchingPolicy: Blur.Addresses.StandardPolicyERC721[chainId],
      nonce: 0,
      expirationTime: Math.floor(Date.now() / 1000) + 86400,
      fees: [],
      salt: hashNonce,
      extraParams: "0x",
    });

    await sellOrder.sign(seller);

    const orderInfo: orders.blur.OrderInfo = {
      orderParams: sellOrder.params,
      metadata: {},
    };

    const orderId = sellOrder.hash();

    logger.info("BlurTestnet", `Save ${orderId} to database`);

    // Store order to database
    await orders.blur.save([orderInfo]);

    await wait(10 * 1000);

    const ordeStatus = await getOrder(orderId);
    logger.info("BlurTestnet", `Order status ${JSON.stringify(ordeStatus)}`);

    // Create matching buy order
    const buyOrder = sellOrder.buildMatching({
      trader: buyer.address,
    });

    // Cancel order
    const cancelTx = await exchange.cancelOrder(seller, sellOrder);
    await cancelTx.wait();

    logger.info("BlurTestnet", `Cancel tx=${cancelTx.hash}`);

    let isReverted = false;

    // Fill order
    try {
      const fillTx = await exchange.fillOrder(buyer, sellOrder, buyOrder);
      logger.info("BlurTestnet", `Fill order=${orderId}, tx=${fillTx.hash}`);
      await fillTx.wait();
      logger.info("BlurTestnet", `Waiting... ${indexInterval}`);
    } catch (e) {
      isReverted = true;
    }

    expect(isReverted).toEqual(true);

    await wait(indexInterval);

    // Check order
    const orderAfter = await getOrder(orderId);
    logger.info("BlurTestnet", `Order status ${JSON.stringify(orderAfter)}`);
    expect(orderAfter?.fillability_status).toEqual("cancelled");
  });

  test("saveToAPI", async () => {
    await setupNFTs(nftToken, seller, buyer, tokenId, operator);

    const exchange = new Blur.Exchange(chainId);
    const builder = new Blur.Builders.SingleToken(chainId);
    const price = parseEther("0.001");

    const hashNonce = await exchange.getNonce(baseProvider, seller.address);

    logger.info("BlurTestnet", `hashNonce=${hashNonce}`);

    // Build Sell order
    const sellOrder = builder.build({
      side: "sell",
      trader: seller.address,
      collection: nftToken.address,
      tokenId: tokenId,
      amount: 1,
      paymentToken: Common.Addresses.Eth[chainId],
      price,
      listingTime: Math.floor(Date.now() / 1000),
      matchingPolicy: Blur.Addresses.StandardPolicyERC721[chainId],
      nonce: hashNonce,
      expirationTime: Math.floor(Date.now() / 1000) + 86400,
      fees: [],
      salt: hashNonce,
      extraParams: "0x",
    });

    await sellOrder.sign(seller);

    const orderId = sellOrder.hash();
    const postData = {
      orders: [
        {
          kind: "blur",
          data: sellOrder.params,
        },
      ],
    };

    const headers = {
      "X-Admin-Api-Key": config.adminApiKey,
    };

    try {
      await axios.post("http://localhost:3000/orders/v1", postData, {
        headers,
      });
      // console.log("data", data)
    } catch (e) {
      // console.log("error", e)
    }

    await wait(10 * 1000);
    const ordeStatus = await getOrder(orderId);
    expect(ordeStatus).not.toBe(null);
  });
});

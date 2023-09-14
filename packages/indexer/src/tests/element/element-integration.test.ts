import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();
import { baseProvider } from "@/common/provider";
import { wait } from "../utils/test";
import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import { Wallet } from "@ethersproject/wallet";
import { Element, Common } from "@reservoir0x/sdk";
import { config } from "@/config/index";
import { parseEther } from "@ethersproject/units";
import * as orders from "@/orderbook/orders";
import { logger } from "@/common/logger";

import { testNFTAddr, erc1155NFT, operatorKey, operator2Key } from "./__fixtures__/test-accounts";

import { setupNFTs, setupERC1155NFTs } from "../utils/nft";
import { getOrder } from "../utils/order";
import axios from "axios";

const operatorProvider = new Wallet(operatorKey, baseProvider);
const operator2Provider = new Wallet(operator2Key, baseProvider);

jest.setTimeout(1000 * 1000);

describe("ElementTestnet", () => {
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

  const erc1155 = new Contract(
    erc1155NFT,
    new Interface([
      "function mint(uint256 tokenId) external",
      "function mintMany(uint256 tokenId, uint256 amount) external",
      "function balanceOf(address account, uint256 id) external view returns (uint256)",
      "function setApprovalForAll(address operator, bool approved) external",
      `function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes calldata data
      ) external`,
      `function safeBatchTransferFrom(
        address from,
        address to,
        uint256[] calldata ids,
        uint256[] calldata amounts,
        bytes calldata data
      ) external`,
      "function isApprovedForAll(address account, address operator) external view returns (bool)",
    ]),
    operatorProvider
  );

  const operator = Element.Addresses.Exchange[config.chainId];

  const indexInterval = 80 * 1000;

  // beforeEach(async () => {
  //   await setupNFTs(nftToken, seller, buyer, tokenId, operator);
  // });

  test("sellERC721", async () => {
    await setupNFTs(nftToken, seller, buyer, tokenId, operator);

    const exchange = new Element.Exchange(chainId);
    const builder = new Element.Builders.SingleToken(chainId);
    const price = parseEther("0.001");

    const hashNonce = await exchange.getHashNonce(baseProvider, seller.address);

    logger.info("ElementTestnet", `hashNonce=${hashNonce}`);

    // Build Sell order
    const sellOrder = builder.build({
      direction: "sell",
      maker: seller.address,
      contract: nftToken.address,
      tokenId: tokenId,
      paymentToken: Element.Addresses.Native[config.chainId],
      price,
      hashNonce,
      expiry: Math.floor(Date.now() / 1000) + 10000,
    });

    await sellOrder.sign(seller);

    const orderInfo: orders.element.OrderInfo = {
      orderParams: sellOrder.params,
      metadata: {},
    };

    const orderId = sellOrder.id();
    logger.info("ElementTestnet", `Save ${orderId} to database`);

    // Store order to database
    await orders.element.save([orderInfo]);

    await wait(10 * 1000);

    const ordeStatus = await getOrder(orderId);
    logger.info("ElementTestnet", `Order status ${JSON.stringify(ordeStatus)}`);

    // Create matching buy order
    const buyOrder = sellOrder.buildMatching();

    // Fill order
    const fillTx = await exchange.fillOrder(buyer, sellOrder, buyOrder);

    logger.info("ElementTestnet", `Fill order=${orderId}, tx=${fillTx.hash}`);

    await fillTx.wait();

    logger.info("ElementTestnet", `Waiting... ${indexInterval}`);

    await wait(indexInterval);

    // Check order
    const orderAfter = await getOrder(orderId);
    logger.info("ElementTestnet", `Order status ${JSON.stringify(orderAfter)}`);
    expect(orderAfter?.fillability_status).toEqual("filled");
  });

  test("buyERC721", async () => {
    await setupNFTs(nftToken, seller, buyer, tokenId, operator);

    const exchange = new Element.Exchange(chainId);
    const builder = new Element.Builders.SingleToken(chainId);
    const price = parseEther("0.001");

    const weth = new Common.Helpers.WNative(baseProvider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    const approveTx = await weth.approve(buyer, Element.Addresses.Exchange[chainId]);

    await approveTx.wait();

    await wait(20 * 1000);

    const hashNonce = await exchange.getHashNonce(baseProvider, buyer.address);

    logger.info("ElementTestnet", `hashNonce=${hashNonce}`);

    // Build Sell order
    const buyOrder = builder.build({
      direction: "buy",
      maker: buyer.address,
      contract: nftToken.address,
      tokenId: tokenId,
      paymentToken: Common.Addresses.WNative[chainId],
      price,
      hashNonce,
      expiry: Math.floor(Date.now() / 1000) + 10000,
    });

    await buyOrder.sign(buyer);

    const orderInfo: orders.element.OrderInfo = {
      orderParams: buyOrder.params,
      metadata: {},
    };

    const orderId = buyOrder.id();

    logger.info("ElementTestnet", `Save ${orderId} to database`);

    // Store order to database
    await orders.element.save([orderInfo]);

    await wait(10 * 1000);

    const ordeStatus = await getOrder(orderId);
    logger.info("ElementTestnet", `Order status ${JSON.stringify(ordeStatus)}`);

    // Create matching buy order
    const sellOrder = buyOrder.buildMatching();

    // Fill order
    const fillTx = await exchange.fillOrder(seller, buyOrder, sellOrder);

    logger.info("ElementTestnet", `Fill order=${orderId}, tx=${fillTx.hash}`);

    await fillTx.wait();

    logger.info("ElementTestnet", `Waiting... ${indexInterval}`);

    await wait(indexInterval);

    // Check order
    const orderAfter = await getOrder(orderId);
    logger.info("ElementTestnet", `Order status ${JSON.stringify(orderAfter)}`);
    expect(orderAfter?.fillability_status).toEqual("filled");
  });

  test("sellERC1155", async () => {
    await setupERC1155NFTs(erc1155, seller, buyer, tokenId, operator);
    const exchange = new Element.Exchange(chainId);
    const builder = new Element.Builders.SingleToken(chainId);
    const price = parseEther("0.001");

    const hashNonce = await exchange.getHashNonce(baseProvider, seller.address);

    logger.info("ElementTestnet", `hashNonce=${hashNonce}`);

    // Build Sell order
    const sellOrder = builder.build({
      direction: "sell",
      maker: seller.address,
      contract: erc1155.address,
      tokenId: tokenId,
      amount: 1,
      paymentToken: Element.Addresses.Native[config.chainId],
      price,
      hashNonce,
      expiry: Math.floor(Date.now() / 1000) + 10000,
    });

    await sellOrder.sign(seller);

    const orderInfo: orders.element.OrderInfo = {
      orderParams: sellOrder.params,
      metadata: {},
    };

    const orderId = sellOrder.id();

    logger.info("ElementTestnet", `Save ${orderId} to database`);

    // Store order to database
    const result = await orders.element.save([orderInfo]);

    logger.info("ElementTestnet", `Save result ${JSON.stringify(result)}`);

    await wait(10 * 1000);

    const ordeStatus = await getOrder(orderId);
    logger.info("ElementTestnet", `Order status ${JSON.stringify(ordeStatus)}`);

    // Create matching buy order
    const buyOrder = sellOrder.buildMatching();

    // Fill order
    const fillTx = await exchange.fillOrder(buyer, sellOrder, buyOrder);

    logger.info("ElementTestnet", `Fill order=${orderId}, tx=${fillTx.hash}`);

    await fillTx.wait();

    logger.info("ElementTestnet", `Waiting... ${indexInterval}`);

    await wait(indexInterval);

    // Check order
    const orderAfter = await getOrder(orderId);
    logger.info("ElementTestnet", `Order status ${JSON.stringify(orderAfter)}`);
    expect(orderAfter?.fillability_status).toEqual("filled");
  });

  test("buyERC1155", async () => {
    await setupERC1155NFTs(erc1155, seller, buyer, tokenId, operator);
    const exchange = new Element.Exchange(chainId);
    const builder = new Element.Builders.SingleToken(chainId);
    const price = parseEther("0.001");

    const weth = new Common.Helpers.WNative(baseProvider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    const approveTx = await weth.approve(buyer, Element.Addresses.Exchange[chainId]);

    await approveTx.wait();

    const hashNonce = await exchange.getHashNonce(baseProvider, buyer.address);

    logger.info("ElementTestnet", `hashNonce=${hashNonce}`);

    // Build Sell order
    const buyOrder = builder.build({
      direction: "buy",
      maker: buyer.address,
      contract: erc1155.address,
      tokenId: tokenId,
      amount: 1,
      paymentToken: Common.Addresses.WNative[chainId],
      price,
      hashNonce,
      expiry: Math.floor(Date.now() / 1000) + 10000,
    });

    await buyOrder.sign(buyer);

    const orderInfo: orders.element.OrderInfo = {
      orderParams: buyOrder.params,
      metadata: {},
    };

    const orderId = buyOrder.id();

    logger.info("ElementTestnet", `Save ${orderId} to database`);

    // Store order to database
    const result = await orders.element.save([orderInfo]);

    logger.info("ElementTestnet", `Save result ${JSON.stringify(result)}`);

    await wait(10 * 1000);

    const ordeStatus = await getOrder(orderId);
    logger.info("ElementTestnet", `Order status ${JSON.stringify(ordeStatus)}`);

    // Create matching sell order
    const sellOrder = buyOrder.buildMatching({ amount: 1 });

    // Fill order
    const fillTx = await exchange.fillOrder(seller, buyOrder, sellOrder);

    logger.info("ElementTestnet", `Fill order=${orderId}, tx=${fillTx.hash}`);

    await fillTx.wait();

    logger.info("ElementTestnet", `Waiting... ${indexInterval}`);

    await wait(indexInterval);

    // Check order
    const orderAfter = await getOrder(orderId);
    logger.info("ElementTestnet", `Order status ${JSON.stringify(orderAfter)}`);
    expect(orderAfter?.fillability_status).toEqual("filled");
  });

  test("cancelSellERC721", async () => {
    await setupNFTs(nftToken, seller, buyer, tokenId, operator);

    const exchange = new Element.Exchange(chainId);
    const builder = new Element.Builders.SingleToken(chainId);
    const price = parseEther("0.001");

    const hashNonce = await exchange.getHashNonce(baseProvider, seller.address);

    logger.info("ElementTestnet", `hashNonce=${hashNonce}`);

    // Build Sell order
    const sellOrder = builder.build({
      direction: "sell",
      maker: seller.address,
      contract: nftToken.address,
      tokenId: tokenId,
      paymentToken: Element.Addresses.Native[config.chainId],
      price,
      hashNonce,
      expiry: Math.floor(Date.now() / 1000) + 10000,
    });

    await sellOrder.sign(seller);

    const orderInfo: orders.element.OrderInfo = {
      orderParams: sellOrder.params,
      metadata: {},
    };

    const orderId = sellOrder.id();

    logger.info("ElementTestnet", `Save ${orderId} to database`);

    // Store order to database
    await orders.element.save([orderInfo]);

    await wait(10 * 1000);

    const ordeStatus = await getOrder(orderId);
    logger.info("ElementTestnet", `Order status ${JSON.stringify(ordeStatus)}`);

    // Create matching buy order
    const buyOrder = sellOrder.buildMatching();

    // Cancel order
    const cancelTx = await exchange.cancelOrder(seller, sellOrder);
    await cancelTx.wait();

    logger.info("ElementTestnet", `Cancel tx=${cancelTx.hash}`);

    let isReverted = false;

    // Fill order
    try {
      const fillTx = await exchange.fillOrder(buyer, sellOrder, buyOrder);
      logger.info("ElementTestnet", `Fill order=${orderId}, tx=${fillTx.hash}`);
      await fillTx.wait();
      logger.info("ElementTestnet", `Waiting... ${indexInterval}`);
    } catch (e) {
      isReverted = true;
    }

    expect(isReverted).toEqual(true);

    await wait(indexInterval);

    // Check order
    const orderAfter = await getOrder(orderId);
    logger.info("ElementTestnet", `Order status ${JSON.stringify(orderAfter)}`);
    expect(orderAfter?.fillability_status).toEqual("cancelled");
  });

  test("cancelSellERC1155", async () => {
    await setupERC1155NFTs(erc1155, seller, buyer, tokenId, operator);
    const exchange = new Element.Exchange(chainId);
    const builder = new Element.Builders.SingleToken(chainId);
    const price = parseEther("0.001");

    const hashNonce = await exchange.getHashNonce(baseProvider, seller.address);

    logger.info("ElementTestnet", `hashNonce=${hashNonce}`);

    // Build Sell order
    const sellOrder = builder.build({
      direction: "sell",
      maker: seller.address,
      contract: erc1155.address,
      tokenId: tokenId,
      amount: 1,
      paymentToken: Element.Addresses.Native[config.chainId],
      price,
      hashNonce,
      expiry: Math.floor(Date.now() / 1000) + 10000,
    });

    await sellOrder.sign(seller);

    const orderInfo: orders.element.OrderInfo = {
      orderParams: sellOrder.params,
      metadata: {},
    };

    const orderId = sellOrder.id();

    logger.info("ElementTestnet", `Save ${orderId} to database`);

    // Store order to database
    const result = await orders.element.save([orderInfo]);

    logger.info("ElementTestnet", `Save result ${JSON.stringify(result)}`);

    await wait(10 * 1000);

    const ordeStatus = await getOrder(orderId);
    logger.info("ElementTestnet", `Order status ${JSON.stringify(ordeStatus)}`);

    // Cancel order
    const cancelTx = await exchange.incrementHashNonce(seller);
    await cancelTx.wait();

    // Create matching buy order
    const buyOrder = sellOrder.buildMatching();

    let isReverted = false;
    // Fill order
    try {
      const fillTx = await exchange.fillOrder(buyer, sellOrder, buyOrder);

      logger.info("ElementTestnet", `Fill order=${orderId}, tx=${fillTx.hash}`);

      await fillTx.wait();

      logger.info("ElementTestnet", `Waiting... ${indexInterval}`);
    } catch (e) {
      isReverted = true;
    }

    expect(isReverted).toEqual(true);

    await wait(indexInterval);

    // Check order
    const orderAfter = await getOrder(orderId);
    logger.info("ElementTestnet", `Order status ${JSON.stringify(orderAfter)}`);
    expect(orderAfter?.fillability_status).toEqual("cancelled");
  });

  test("saveToAPI", async () => {
    await setupNFTs(nftToken, seller, buyer, tokenId, operator);

    const exchange = new Element.Exchange(chainId);
    const builder = new Element.Builders.SingleToken(chainId);
    const price = parseEther("0.001");

    const hashNonce = await exchange.getHashNonce(baseProvider, seller.address);

    // Build Sell order
    const sellOrder = builder.build({
      direction: "sell",
      maker: seller.address,
      contract: nftToken.address,
      tokenId: tokenId,
      paymentToken: Element.Addresses.Native[config.chainId],
      price,
      hashNonce,
      expiry: Math.floor(Date.now() / 1000) + 10000,
    });

    await sellOrder.sign(seller);

    const orderId = sellOrder.id();
    const postData = {
      orders: [
        {
          kind: "element",
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
    } catch (e) {
      //
    }

    await wait(10 * 1000);
    const ordeStatus = await getOrder(orderId);
    expect(ordeStatus).not.toBe(null);
  });
});

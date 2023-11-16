import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as PaymentProcessorV2 from "@reservoir0x/sdk/src/payment-processor-v2";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";
import { constants } from "ethers";

import { getChainId, getCurrentTimestamp, reset, setupNFTs } from "../../../utils";

describe("PaymentProcessorV2 - SingleToken Erc1155", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let erc1155: Contract;

  beforeEach(async () => {
    [deployer, alice, bob] = await ethers.getSigners();

    ({ erc1155 } = await setupNFTs(deployer));
  });

  afterEach(reset);

  it("Build and fill sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 1;

    // Mint erc1155 to seller
    await erc1155.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the exchange
    await nft.approve(seller, PaymentProcessorV2.Addresses.Exchange[chainId]);

    const exchange = new PaymentProcessorV2.Exchange(chainId);

    const sellerMasterNonce = await exchange.getMasterNonce(ethers.provider, seller.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new PaymentProcessorV2.Builders.SingleToken(chainId);

    // Build sell order
    const sellOrder = builder.build({
      protocol: PaymentProcessorV2.Types.OrderProtocols.ERC1155_FILL_OR_KILL,
      marketplace: constants.AddressZero,
      marketplaceFeeNumerator: "0",
      maxRoyaltyFeeNumerator: "0",
      maker: seller.address,
      tokenAddress: erc1155.address,
      tokenId: soldTokenId,
      amount: "1",
      itemPrice: price,
      expiration: (blockTime + 60 * 60).toString(),
      paymentMethod: constants.AddressZero,
      masterNonce: sellerMasterNonce,
    });

    await sellOrder.sign(seller);

    sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    // Create matching params
    const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);

    await exchange.fillOrder(buyer, sellOrder, {
      taker: buyer.address,
    });

    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const receiveAmount = sellerBalanceAfter.sub(sellerBalanceBefore);
    const sellerNftBalanceAfter = await nft.getBalance(seller.address, soldTokenId);
    const buyerNftBalanceAfter = await nft.getBalance(buyer.address, soldTokenId);

    expect(sellerNftBalanceAfter).to.eq(0);
    expect(buyerNftBalanceAfter).to.eq(1);
    expect(receiveAmount).to.gte(price);
  });

  it("Build and fill buy order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const boughtTokenId = 10;

    const weth = new Common.Helpers.WNative(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, PaymentProcessorV2.Addresses.Exchange[chainId]);

    // Mint erc1155 to seller
    await erc1155.connect(seller).mint(boughtTokenId);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the exchange
    await nft.approve(seller, PaymentProcessorV2.Addresses.Exchange[chainId]);

    const exchange = new PaymentProcessorV2.Exchange(chainId);
    const buyerMasterNonce = await exchange.getMasterNonce(ethers.provider, buyer.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new PaymentProcessorV2.Builders.SingleToken(chainId);

    // Build buy order
    const buyOrder = builder.build({
      protocol: PaymentProcessorV2.Types.OrderProtocols.ERC1155_FILL_OR_KILL,
      beneficiary: buyer.address,
      marketplace: constants.AddressZero,
      marketplaceFeeNumerator: "0",
      maxRoyaltyFeeNumerator: "0",
      maker: buyer.address,
      tokenAddress: erc1155.address,
      tokenId: boughtTokenId,
      amount: "1",
      itemPrice: price,
      expiration: (blockTime + 60 * 60).toString(),
      paymentMethod: Common.Addresses.WNative[chainId],
      masterNonce: buyerMasterNonce,
    });

    // Sign the order
    await buyOrder.sign(buyer);
    buyOrder.checkSignature();

    await buyOrder.checkFillability(ethers.provider);

    const sellerBalanceBefore = await weth.getBalance(seller.address);

    await exchange.fillOrder(seller, buyOrder, {
      taker: buyer.address,
    });

    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const receiveAmount = sellerBalanceAfter.sub(sellerBalanceBefore);

    const sellerNftBalanceAfter = await nft.getBalance(seller.address, boughtTokenId);
    const buyerNftBalanceAfter = await nft.getBalance(buyer.address, boughtTokenId);

    expect(receiveAmount).to.gte(price);
    expect(sellerNftBalanceAfter).to.eq(0);
    expect(buyerNftBalanceAfter).to.eq(1);
  });
});

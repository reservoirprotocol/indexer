import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as Sdk from "@reservoir0x/sdk/src";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";
import { constants } from "ethers";

import { getChainId, getCurrentTimestamp, reset, setupNFTs } from "../../utils";

describe("[ReservoirV6_0_1] - PaymentProcessor listings", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let erc721: Contract;
  let erc1155: Contract;
  let router: Contract;
  let paymentProcessorModule: Contract;

  beforeEach(async () => {
    [deployer, alice, bob] = await ethers.getSigners();

    ({ erc721, erc1155 } = await setupNFTs(deployer));

    router = await ethers
      .getContractFactory("ReservoirV6_0_1", deployer)
      .then((factory) => factory.deploy());
    paymentProcessorModule = await ethers
      .getContractFactory("PaymentProcessorModule", deployer)
      .then((factory) =>
        factory.deploy(
          deployer.address,
          router.address,
          Sdk.PaymentProcessor.Addresses.Exchange[chainId]
        )
      );
  });

  afterEach(reset);

  it("Build and fill ERC721 sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const tokenId = 1;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(tokenId);
    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the exchange
    await nft.approve(seller, Sdk.PaymentProcessor.Addresses.Exchange[chainId]);

    const exchange = new Sdk.PaymentProcessor.Exchange(chainId);

    const sellerMasterNonce = await exchange.getMasterNonce(ethers.provider, seller.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new Sdk.PaymentProcessor.Builders.SingleToken(chainId);
    const orderParameters = {
      protocol: 0,
      sellerAcceptedOffer: false,
      marketplace: constants.AddressZero,
      marketplaceFeeNumerator: "0",
      maxRoyaltyFeeNumerator: "0",
      privateTaker: constants.AddressZero,
      trader: seller.address,
      tokenAddress: erc721.address,
      tokenId,
      amount: "1",
      price: price,
      expiration: (blockTime + 60 * 60).toString(),
      nonce: "0",
      coin: constants.AddressZero,
      masterNonce: sellerMasterNonce,
    };

    // Build sell order
    const sellOrder = builder.build(orderParameters);
    await sellOrder.sign(seller);

    const buyOrder = sellOrder.buildMatching({
      taker: paymentProcessorModule.address,
      takerMasterNonce: "0",
    });

    sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);

    await paymentProcessorModule.acceptETHListings(
      [sellOrder.getMatchedOrder(buyOrder)],
      [sellOrder.params],
      {
        fillTo: buyer.address,
        refundTo: buyer.address,
        revertIfIncomplete: true,
        amount: price,
      },
      [],
      { value: price }
    );

    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(tokenId);
    const receiveAmount = sellerBalanceAfter.sub(sellerBalanceBefore);

    expect(receiveAmount).to.gte(price);
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Build and fill ERC1155 sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const tokenId = 1;
    const amount = 10;

    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(tokenId, amount);
    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the exchange
    await nft.approve(seller, Sdk.PaymentProcessor.Addresses.Exchange[chainId]);

    const exchange = new Sdk.PaymentProcessor.Exchange(chainId);

    const sellerMasterNonce = await exchange.getMasterNonce(ethers.provider, seller.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new Sdk.PaymentProcessor.Builders.SingleToken(chainId);
    const orderParameters = {
      protocol: 1,
      sellerAcceptedOffer: false,
      marketplace: constants.AddressZero,
      marketplaceFeeNumerator: "0",
      maxRoyaltyFeeNumerator: "0",
      privateTaker: constants.AddressZero,
      trader: seller.address,
      tokenAddress: erc1155.address,
      tokenId,
      amount,
      price: price.mul(amount),
      expiration: (blockTime + 60 * 60).toString(),
      nonce: "0",
      coin: constants.AddressZero,
      masterNonce: sellerMasterNonce,
    };

    // Build sell order
    const sellOrder = builder.build(orderParameters);
    await sellOrder.sign(seller);

    const buyOrder = sellOrder.buildMatching({
      taker: paymentProcessorModule.address,
      takerMasterNonce: "0",
    });

    sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);

    await paymentProcessorModule.acceptETHListings(
      [sellOrder.getMatchedOrder(buyOrder)],
      [sellOrder.params],
      {
        fillTo: buyer.address,
        refundTo: buyer.address,
        revertIfIncomplete: true,
        amount: price.mul(amount),
      },
      [],
      { value: price.mul(amount) }
    );

    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const buyerNftBalanceAfter = await nft.getBalance(buyer.address, tokenId);
    const receiveAmount = sellerBalanceAfter.sub(sellerBalanceBefore);

    expect(receiveAmount).to.gte(price.mul(amount));
    expect(buyerNftBalanceAfter).to.eq(amount);
  });
});

import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as Sdk from "@reservoir0x/sdk/src";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";
import { constants } from "ethers";

import { getChainId, getCurrentTimestamp, reset, setupNFTs } from "../../utils";

describe("[ReservoirV6_0_1] - PaymentProcessorV2 offers", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let erc721: Contract;
  let erc1155: Contract;
  let router: Contract;
  let paymentProcessorV2Module: Contract;

  beforeEach(async () => {
    [deployer, alice, bob] = await ethers.getSigners();

    ({ erc721, erc1155 } = await setupNFTs(deployer));

    router = await ethers
      .getContractFactory("ReservoirV6_0_1", deployer)
      .then((factory) => factory.deploy());
      paymentProcessorV2Module = await ethers
      .getContractFactory("PaymentProcessorV2Module", deployer)
      .then((factory) =>
        factory.deploy(
          deployer.address,
          router.address,
          Sdk.PaymentProcessorV2.Addresses.Exchange[chainId]
        )
      );
  });

  afterEach(reset);

  it("Build and fill ERC721 buy order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const tokenId = 1;

    const weth = new Common.Helpers.WNative(ethers.provider, chainId);
    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Sdk.PaymentProcessorV2.Addresses.Exchange[chainId]);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(tokenId);
    await erc721
      .connect(seller)
      .transferFrom(seller.address, paymentProcessorV2Module.address, tokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the exchange
    await nft.approve(seller, Sdk.PaymentProcessorV2.Addresses.Exchange[chainId]);
    await nft.approve(seller, paymentProcessorV2Module.address);

    const exchange = new Sdk.PaymentProcessorV2.Exchange(chainId);
    const buyerMasterNonce = await exchange.getMasterNonce(ethers.provider, buyer.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new Sdk.PaymentProcessorV2.Builders.SingleToken(chainId);
    const orderParameters = {
      protocol: Sdk.PaymentProcessorV2.Types.OrderProtocols.ERC721_FILL_OR_KILL,
      beneficiary: buyer.address,
      marketplace: constants.AddressZero,
      marketplaceFeeNumerator: "0",
      maxRoyaltyFeeNumerator: "0",
      maker: buyer.address,
      tokenAddress: erc721.address,
      tokenId: tokenId,
      amount: "1",
      itemPrice: price,
      expiration: (blockTime + 60 * 60).toString(),
      paymentMethod: Common.Addresses.WNative[chainId],
      masterNonce: buyerMasterNonce,
    };

    const buyOrder = builder.build(orderParameters);
    await buyOrder.sign(buyer);

    const matchedOrder = buyOrder.buildMatching({
      taker: paymentProcessorV2Module.address,
    });

    buyOrder.checkSignature();
    await buyOrder.checkFillability(ethers.provider);

    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    await paymentProcessorV2Module.acceptOffers(
      [
        {
          domainSeparator: exchange.domainSeparator,
          isCollectionLevelOffer: false,
          saleDetails: matchedOrder,
          signature: matchedOrder.signature,
          tokenSetProof: buyOrder.getTokenSetProof(),
          cosignature: buyOrder.getCosignature(),
          feeOnTop: {
            recipient: constants.AddressZero,
            amount: "0"
          }
        }
      ],
      {
        fillTo: seller.address,
        refundTo: seller.address,
        revertIfIncomplete: true,
        amount: price,
      },
      []
    );

    const sellerBalanceBefore = await weth.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(tokenId);
    const receiveAmount = sellerBalanceAfter.sub(sellerBalanceBefore);

    expect(receiveAmount).to.gte(price);
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Build and fill ERC721 contract-wide buy order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const tokenId = 1;

    const weth = new Common.Helpers.WNative(ethers.provider, chainId);
    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Sdk.PaymentProcessorV2.Addresses.Exchange[chainId]);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(tokenId);
    await erc721
      .connect(seller)
      .transferFrom(seller.address, paymentProcessorV2Module.address, tokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the exchange
    await nft.approve(seller, Sdk.PaymentProcessorV2.Addresses.Exchange[chainId]);
    await nft.approve(seller, paymentProcessorV2Module.address);

    const exchange = new Sdk.PaymentProcessorV2.Exchange(chainId);
    const buyerMasterNonce = await exchange.getMasterNonce(ethers.provider, buyer.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new Sdk.PaymentProcessorV2.Builders.ContractWide(chainId);
    const buyOrder = builder.build({
      protocol: Sdk.PaymentProcessorV2.Types.OrderProtocols.ERC721_FILL_OR_KILL,
      marketplace: constants.AddressZero,
      beneficiary: buyer.address,
      marketplaceFeeNumerator: "0",
      maxRoyaltyFeeNumerator: "0",
      maker: buyer.address,
      tokenAddress: erc721.address,
      amount: "1",
      itemPrice: price,
      expiration: (blockTime + 60 * 60).toString(),
      nonce: "0",
      paymentMethod: Common.Addresses.WNative[chainId],
      masterNonce: buyerMasterNonce,
    });

    await buyOrder.sign(buyer);

    buyOrder.checkSignature();
    await buyOrder.checkFillability(ethers.provider);

    const matchedOrder = buyOrder.buildMatching({
      taker: paymentProcessorV2Module.address,
      tokenId: tokenId,
    });

    buyOrder.checkSignature();
    await buyOrder.checkFillability(ethers.provider);

    await paymentProcessorV2Module.acceptOffers(
      [
        {
          domainSeparator: exchange.domainSeparator,
          isCollectionLevelOffer: true,
          saleDetails: matchedOrder,
          signature: matchedOrder.signature,
          tokenSetProof: buyOrder.getTokenSetProof(),
          cosignature: buyOrder.getCosignature(),
          feeOnTop: {
            recipient: constants.AddressZero,
            amount: "0"
          }
        }
      ],
      {
        fillTo: seller.address,
        refundTo: seller.address,
        revertIfIncomplete: true,
        amount: price,
      },
      []
    );

    const receiveAmount = await weth.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(tokenId);

    expect(receiveAmount).to.gte(price);
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Build and fill ERC1155 buy order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const tokenId = 1;
    const amount = 10;

    const weth = new Common.Helpers.WNative(ethers.provider, chainId);
    // Mint weth to buyer
    await weth.deposit(buyer, price.mul(amount));

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Sdk.PaymentProcessorV2.Addresses.Exchange[chainId]);

    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(tokenId, amount);
    await erc1155
      .connect(seller)
      .safeTransferFrom(seller.address, paymentProcessorV2Module.address, tokenId, amount, "0x");

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the exchange
    await nft.approve(seller, Sdk.PaymentProcessor.Addresses.Exchange[chainId]);
    await nft.approve(seller, paymentProcessorV2Module.address);

    const exchange = new Sdk.PaymentProcessorV2.Exchange(chainId);
    const buyerMasterNonce = await exchange.getMasterNonce(ethers.provider, buyer.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new Sdk.PaymentProcessorV2.Builders.SingleToken(chainId);

    // Build buy order
    const buyOrder = builder.build({
      protocol: Sdk.PaymentProcessorV2.Types.OrderProtocols.ERC1155_FILL_OR_KILL,
      beneficiary: buyer.address,
      marketplace: constants.AddressZero,
      marketplaceFeeNumerator: "0",
      maxRoyaltyFeeNumerator: "0",
      maker: buyer.address,
      tokenAddress: erc1155.address,
      tokenId: tokenId,
      amount: amount,
      itemPrice: price.mul(amount),
      expiration: (blockTime + 60 * 60).toString(),
      paymentMethod: Common.Addresses.WNative[chainId],
      masterNonce: buyerMasterNonce,
    });

    // Sign the order
    await buyOrder.sign(buyer);
    buyOrder.checkSignature();

    const matchedOrder = buyOrder.buildMatching({
      taker: paymentProcessorV2Module.address,
    });

    await buyOrder.checkFillability(ethers.provider);

    await paymentProcessorV2Module.acceptOffers(
      [
        {
          domainSeparator: exchange.domainSeparator,
          isCollectionLevelOffer: false,
          saleDetails: matchedOrder,
          signature: matchedOrder.signature,
          tokenSetProof: buyOrder.getTokenSetProof(),
          cosignature: buyOrder.getCosignature(),
          feeOnTop: {
            recipient: constants.AddressZero,
            amount: "0"
          }
        }
      ],
      {
        fillTo: seller.address,
        refundTo: seller.address,
        revertIfIncomplete: true,
        amount: price.mul(amount),
      },
      []
    );

    const buyerNftBalanceAfter = await nft.getBalance(buyer.address, tokenId);
    const receiveAmount = await weth.getBalance(seller.address);

    expect(receiveAmount).to.gte(price.mul(amount));
    expect(buyerNftBalanceAfter).to.eq(amount);
  });
});

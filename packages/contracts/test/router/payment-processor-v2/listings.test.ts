import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as Sdk from "@reservoir0x/sdk/src";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";
import { constants } from "ethers";

import { getChainId, getCurrentTimestamp, reset, setupNFTs } from "../../utils";

describe("[ReservoirV6_0_1] - PaymentProcessorV2 listings", () => {
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

    Sdk.RouterV6.Addresses.PaymentProcessorV2Module[chainId] 
      = paymentProcessorV2Module.address.toLowerCase();
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
    await nft.approve(seller, Sdk.PaymentProcessorV2.Addresses.Exchange[chainId]);

    const exchange = new Sdk.PaymentProcessorV2.Exchange(chainId);

    const sellerMasterNonce = await exchange.getMasterNonce(ethers.provider, seller.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new Sdk.PaymentProcessorV2.Builders.SingleToken(chainId);
    const orderParameters = {
      protocol: Sdk.PaymentProcessorV2.Types.OrderProtocols.ERC721_FILL_OR_KILL,
      marketplace: constants.AddressZero,
      marketplaceFeeNumerator: "0",
      maxRoyaltyFeeNumerator: "0",
      maker: seller.address,
      tokenAddress: erc721.address,
      tokenId: tokenId,
      amount: "1",
      itemPrice: price,
      expiration: (blockTime + 60 * 60).toString(),
      paymentMethod: constants.AddressZero,
      masterNonce: sellerMasterNonce,
    };

    // Build sell order
    const sellOrder = builder.build(orderParameters);
    await sellOrder.sign(seller);

    const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);

    const matchedOrder = sellOrder.buildMatching({
      taker: paymentProcessorV2Module.address
    })

    await paymentProcessorV2Module.acceptETHListings(
      [
        {
          domainSeparator: exchange.domainSeparator,
          saleDetails: matchedOrder,
          signature: matchedOrder.signature,
          cosignature: sellOrder.getCosignature(),
          feeOnTop: {
            recipient: constants.AddressZero,
            amount: "0"
          }
        }
      ],
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


  it("Build and fill ERC721 sell order via router", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const tokenId = 1;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(tokenId);
    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the exchange
    await nft.approve(seller, Sdk.PaymentProcessorV2.Addresses.Exchange[chainId]);

    const exchange = new Sdk.PaymentProcessorV2.Exchange(chainId);

    const sellerMasterNonce = await exchange.getMasterNonce(ethers.provider, seller.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new Sdk.PaymentProcessorV2.Builders.SingleToken(chainId);
    const orderParameters = {
      protocol: Sdk.PaymentProcessorV2.Types.OrderProtocols.ERC721_FILL_OR_KILL,
      marketplace: constants.AddressZero,
      marketplaceFeeNumerator: "0",
      maxRoyaltyFeeNumerator: "0",
      maker: seller.address,
      tokenAddress: erc721.address,
      tokenId: tokenId,
      amount: "1",
      itemPrice: price,
      expiration: (blockTime + 60 * 60).toString(),
      paymentMethod: constants.AddressZero,
      masterNonce: sellerMasterNonce,
    };

    // Build sell order
    const sellOrder = builder.build(orderParameters);
    await sellOrder.sign(seller);

    const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);

    const router = new Sdk.RouterV6.Router(chainId, ethers.provider);
    const result = await router.fillListingsTx(
      [
        {
          orderId: "1",
          kind: "payment-processor-v2",
          contractKind: "erc721",
          contract: erc721.address,
          tokenId: tokenId.toString(),
          order: sellOrder,
          currency: constants.AddressZero,
          price: price.toString(),
        }
      ],
      buyer.address,
      Sdk.Common.Addresses.Native[chainId],
      {
        source: "reservoir.market",
      }
    );

    for(const tx of result.txs) {
      await buyer.sendTransaction(tx.txData);
    }
    
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const moduleBalanceAfter = await ethers.provider.getBalance(router.contracts.paymentProcessorV2Module.address);
    const ownerAfter = await nft.getOwner(tokenId);
    const receiveAmount = sellerBalanceAfter.sub(sellerBalanceBefore);

    expect(receiveAmount).to.gte(price);
    expect(ownerAfter).to.eq(buyer.address);
    expect(moduleBalanceAfter).to.eq(0);
  });
});

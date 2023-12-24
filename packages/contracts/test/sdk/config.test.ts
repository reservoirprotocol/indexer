import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import * as Sdk from "@reservoir0x/sdk";
import * as Common from "@reservoir0x/sdk/src/common";
import { getSourceHash } from "@reservoir0x/sdk/src/utils";
import { expect } from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";

import { getChainId, getCurrentTimestamp, reset, setupNFTs } from "../utils";

describe("Global Config", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let erc721: Contract;

  beforeEach(async () => {
    [deployer, alice, bob] = await ethers.getSigners();

    ({ erc721 } = await setupNFTs(deployer));
  });

  afterEach(reset);

  it("Config global aggregator source", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 1;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);
    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the exchange
    await nft.approve(seller, Sdk.PaymentProcessor.Addresses.Exchange[chainId]);

    const exchange = new Sdk.PaymentProcessor.Exchange(chainId);

    const sellerMasterNonce = await exchange.getMasterNonce(ethers.provider, seller.address);
    const takerMasterNonce = await exchange.getMasterNonce(ethers.provider, buyer.address);
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
      tokenId: soldTokenId,
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
      taker: buyer.address,
      takerMasterNonce: takerMasterNonce,
    });
    await buyOrder.sign(buyer);

    buyOrder.checkSignature();
    sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    // Set source
    const testSource = "test.xyz";
    Sdk.Global.Config.aggregatorSource = testSource;
    const currentSource = Sdk.Global.Config.aggregatorSource;

    const tx = exchange.fillOrderTx(await buyer.getAddress(), sellOrder, buyOrder);
    const source = getSourceHash(currentSource);
    expect(tx.data.endsWith(source)).to.eq(true);
    expect(testSource).to.eq(currentSource);

    // Clear source
    Sdk.Global.Config.aggregatorSource = undefined;

    const tx2 = exchange.fillOrderTx(await buyer.getAddress(), sellOrder, buyOrder);
    const source2 = getSourceHash("");
    expect(tx2.data.endsWith(source2)).to.eq(true);
  });
});

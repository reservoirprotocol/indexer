import { HashZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as SeaportV16 from "@reservoir0x/sdk/src/seaport-v1.6";
import { Builders } from "@reservoir0x/sdk/src/seaport-base";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import { getChainId, getCurrentTimestamp, reset, setupV16Zones, setupNFTs } from "../../utils";

describe("SeaportV16 - SingleToken Erc721 - Cosign", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let erc721: Contract;
  let zone: string;
  let signer: SignerWithAddress;

  beforeEach(async () => {
    [deployer, alice, bob] = await ethers.getSigners();

    ({ erc721 } = await setupNFTs(deployer));
    ({ zone, signer } = await setupV16Zones(chainId, deployer));
  });

  afterEach(reset);

  it("Build and fill sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 1;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the exchange
    await nft.approve(seller, SeaportV16.Addresses.Exchange[chainId]);

    const exchange = new SeaportV16.Exchange(chainId);

    const builder = new Builders.SingleToken(chainId);

    // Build sell order
    const sellOrder = builder.build(
      {
        side: "sell",
        tokenKind: "erc721",
        offerer: seller.address,
        contract: erc721.address,
        tokenId: soldTokenId,
        paymentToken: Common.Addresses.Native[chainId],
        price,
        counter: 0,
        zone,
        zoneHash: HashZero,
        startTime: await getCurrentTimestamp(ethers.provider),
        endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
      },
      SeaportV16.Order
    );

    // Sign the order
    await sellOrder.sign(seller);
    await sellOrder.checkFillability(ethers.provider);

    // Cosign
    await sellOrder.cosign(signer, buyer.address, {
      amount: 1,
    });

    // Create matching params
    const matchParams = sellOrder.buildMatching();

    const buyerEthBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerEthBalanceBefore = await ethers.provider.getBalance(seller.address);
    const ownerBefore = await nft.getOwner(soldTokenId);

    expect(ownerBefore).to.eq(seller.address);

    // Match orders
    await exchange.fillOrder(buyer, sellOrder, matchParams, {
      source: "reservoir.market",
    });

    const buyerEthBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerEthBalanceAfter = await ethers.provider.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(soldTokenId);

    expect(buyerEthBalanceBefore.sub(buyerEthBalanceAfter)).to.be.gt(price);
    expect(sellerEthBalanceAfter).to.eq(sellerEthBalanceBefore.add(price));
    expect(ownerAfter).to.eq(buyer.address);
  });
});

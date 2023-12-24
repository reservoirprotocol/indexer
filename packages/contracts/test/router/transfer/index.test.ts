import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as Sdk from "@reservoir0x/sdk/src";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";
import { constants } from "ethers";
import * as ApprovalProxy from "@reservoir0x/sdk/src/router/v6/approval-proxy";

import { getChainId, getCurrentTimestamp, reset, setupNFTs } from "../../utils";

describe("[ReservoirV6_0_1] - Transfer", () => {
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

  it("Batch Transfer With OpenSea", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const tokenId = 1;
    const tokenId2 = 2;

    const weth = new Sdk.Common.Helpers.WNative(ethers.provider, chainId);
    await weth.deposit(buyer, price);

    // Mint erc721 to seller
    await erc721.connect(buyer).mint(tokenId);
    await erc721.connect(buyer).mint(tokenId2);
    
    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    const conduitKey = '0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000'
    const transferDetails: ApprovalProxy.TransferItem[] =  []
    const exchange = new Sdk.SeaportV15.Exchange(chainId);
    const conduit = exchange.deriveConduit(conduitKey);

    // Approve the exchange
    await nft.approve(buyer, conduit);
    await weth.approve(buyer, conduit);

    transferDetails.push({
      items: [
        {
          itemType: ApprovalProxy.ItemType.ERC721,
          token: erc721.address,
          amount: "1",
          identifier: tokenId.toString(),
        },
        {
          itemType: ApprovalProxy.ItemType.ERC721,
          token: erc721.address,
          amount: "1",
          identifier: tokenId2.toString(),
        },
        {
          itemType: ApprovalProxy.ItemType.ERC20,
          token: weth.contract.address,
          amount: price.toString(),
          identifier: 0
        }
      ],
      recipient: seller.address,
  })

    const router = new Sdk.RouterV6.Router(chainId, ethers.provider);
    const tx = await router.genTransferTx(transferDetails, buyer.address, "opensea");

    await buyer.sendTransaction(tx);

    const ownerAfter = await nft.getOwner(tokenId);
    const wethBalance = await weth.getBalance(seller.address);

    expect(wethBalance).to.gte(price);
    expect(ownerAfter).to.eq(seller.address);
  });


  it("Batch Transfer With Reservoir Approval Proxy", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const tokenId = 1;
    const tokenId2 = 2;

    const weth = new Sdk.Common.Helpers.WNative(ethers.provider, chainId);
    await weth.deposit(buyer, price);

    // Mint erc721 to seller
    await erc721.connect(buyer).mint(tokenId);
    await erc721.connect(buyer).mint(tokenId2);
    
    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    const conduitKey = Sdk.SeaportBase.Addresses.ReservoirConduitKey[chainId]

    const transferDetails: ApprovalProxy.TransferItem[] =  []
    const exchange = new Sdk.SeaportV15.Exchange(chainId);
    const conduit = exchange.deriveConduit(conduitKey);

    // Approve the exchange
    await nft.approve(buyer, conduit);
    await weth.approve(buyer, conduit);

    transferDetails.push({
        items: [
          {
            itemType: ApprovalProxy.ItemType.ERC721,
            token: erc721.address,
            amount: "1",
            identifier: tokenId.toString(),
          },
          {
            itemType: ApprovalProxy.ItemType.ERC721,
            token: erc721.address,
            amount: "1",
            identifier: tokenId2.toString(),
          },
          {
            itemType: ApprovalProxy.ItemType.ERC20,
            token: weth.contract.address,
            amount: price.toString(),
            identifier: 0
          }
        ],
        recipient: seller.address,
    })

    const router = new Sdk.RouterV6.Router(chainId, ethers.provider);
    const tx = await router.genTransferTx(transferDetails, buyer.address, "reservoir");

    await buyer.sendTransaction(tx);

    const ownerAfter = await nft.getOwner(tokenId);
    const wethBalance = await weth.getBalance(seller.address);

    expect(wethBalance).to.gte(price);
    expect(ownerAfter).to.eq(seller.address);
  });
});

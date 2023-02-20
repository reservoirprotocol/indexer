import { Contract } from "@ethersproject/contracts";
import {
  TransactionReceipt,
  TransactionResponse,
} from "@ethersproject/providers";
import { parseEther, parseUnits } from "@ethersproject/units";
import * as Sdk from "@reservoir0x/sdk/src";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import { ExecutionInfo } from "./helpers/router";
import {
  SeaportERC721Approval,
  SeaportListing,
  SeaportOffer,
  setupSeaportERC721Approvals,
  setupSeaportListings,
  setupSeaportOffers,
} from "./helpers/seaport";
import {
  bn,
  getChainId,
  getRandomInteger,
  getRandomFloat,
  reset,
  setupNFTs,
} from "../../utils";

describe("[ReservoirV6_0_0] Various edge-cases", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let david: SignerWithAddress;
  let emilio: SignerWithAddress;

  let erc721: Contract;
  let router: Contract;
  let balanceAssertModule: Contract;
  let seaportModule: Contract;
  let seaportApprovalOrderZone: Contract;
  let wethModule: Contract;

  beforeEach(async () => {
    [deployer, alice, bob, carol, david, emilio] = await ethers.getSigners();

    ({ erc721 } = await setupNFTs(deployer));

    router = (await ethers
      .getContractFactory("ReservoirV6_0_0", deployer)
      .then((factory) => factory.deploy())) as any;
    balanceAssertModule = (await ethers
      .getContractFactory("BalanceAssertModule", deployer)
      .then((factory) => factory.deploy())) as any;
    seaportModule = (await ethers
      .getContractFactory("SeaportModule", deployer)
      .then((factory) =>
        factory.deploy(router.address, router.address)
      )) as any;
    seaportApprovalOrderZone = (await ethers
      .getContractFactory("SeaportApprovalOrderZone", deployer)
      .then((factory) => factory.deploy())) as any;
    wethModule = (await ethers
      .getContractFactory("WETHModule", deployer)
      .then((factory) => factory.deploy(deployer.address))) as any;
  });

  const getBalances = async (token: string) => {
    if (token === Sdk.Common.Addresses.Eth[chainId]) {
      return {
        alice: await ethers.provider.getBalance(alice.address),
        bob: await ethers.provider.getBalance(bob.address),
        carol: await ethers.provider.getBalance(carol.address),
        david: await ethers.provider.getBalance(david.address),
        emilio: await ethers.provider.getBalance(emilio.address),
        router: await ethers.provider.getBalance(router.address),
        seaportModule: await ethers.provider.getBalance(seaportModule.address),
        wethModule: await ethers.provider.getBalance(wethModule.address),
      };
    } else {
      const contract = new Sdk.Common.Helpers.Erc20(ethers.provider, token);
      return {
        alice: await contract.getBalance(alice.address),
        bob: await contract.getBalance(bob.address),
        carol: await contract.getBalance(carol.address),
        david: await contract.getBalance(david.address),
        emilio: await contract.getBalance(emilio.address),
        router: await contract.getBalance(router.address),
        seaportModule: await contract.getBalance(seaportModule.address),
        wethModule: await ethers.provider.getBalance(wethModule.address),
      };
    }
  };

  afterEach(reset);

  it("Atomically buy and sell", async () => {
    // Setup

    // Listing maker: Alice
    // Offer maker: Bob
    // Arbitrageur: Carol

    const listing: SeaportListing = {
      seller: alice,
      nft: {
        kind: "erc721",
        contract: erc721,
        id: 9876,
      },
      price: parseUnits("2.576", 18),
    };
    await setupSeaportListings([listing]);

    const offer: SeaportOffer = {
      buyer: bob,
      nft: {
        kind: "erc721",
        contract: erc721,
        id: 9876,
      },
      price: parseUnits("3", 18),
    };
    await setupSeaportOffers([offer]);

    // Prepare executions

    const executions: ExecutionInfo[] = [
      // 1. Buy via listing, sending the NFT to the Seaport module
      {
        module: seaportModule.address,
        data: seaportModule.interface.encodeFunctionData("acceptETHListing", [
          {
            parameters: {
              ...listing.order!.params,
              totalOriginalConsiderationItems:
                listing.order!.params.consideration.length,
            },
            numerator: 1,
            denominator: 1,
            signature: listing.order!.params.signature,
            extraData: "0x",
          },
          {
            fillTo: seaportModule.address,
            refundTo: carol.address,
            // Execute atomically
            revertIfIncomplete: true,
            amount: listing.price,
          },
          [],
        ]),
        value: listing.price,
      },
      // 2. Sell via offer
      {
        module: seaportModule.address,
        data: seaportModule.interface.encodeFunctionData("acceptERC721Offer", [
          {
            parameters: {
              ...offer.order!.params,
              totalOriginalConsiderationItems:
                offer.order!.params.consideration.length,
            },
            numerator: 1,
            denominator: 1,
            signature: offer.order!.params.signature,
            extraData: "0x",
          },
          [],
          {
            fillTo: carol.address,
            refundTo: carol.address,
            // Execute atomically
            revertIfIncomplete: true,
          },
          [],
        ]),
        value: 0,
      },
    ];

    // Fetch pre-state

    const ethBalancesBefore = await getBalances(
      Sdk.Common.Addresses.Eth[chainId]
    );
    const wethBalancesBefore = await getBalances(
      Sdk.Common.Addresses.Weth[chainId]
    );

    // Execute

    await router.connect(carol).execute(executions, {
      value: executions
        .map(({ value }) => value)
        .reduce((a, b) => bn(a).add(b)),
    });

    // Fetch post-state

    const ethBalancesAfter = await getBalances(
      Sdk.Common.Addresses.Eth[chainId]
    );
    const wethBalancesAfter = await getBalances(
      Sdk.Common.Addresses.Weth[chainId]
    );

    // Checks

    // Alice got the ETH
    expect(ethBalancesAfter.alice.sub(ethBalancesBefore.alice)).to.eq(
      listing.price
    );

    // Bob got the NFT
    expect(await erc721.ownerOf(offer.nft.id)).to.eq(bob.address);

    // Carol got the WETH
    expect(wethBalancesAfter.carol.sub(wethBalancesBefore.carol)).to.eq(
      offer.price
    );

    // Router is stateless
    expect(ethBalancesAfter.router).to.eq(0);
    expect(ethBalancesAfter.seaportModule).to.eq(0);
    expect(wethBalancesAfter.router).to.eq(0);
    expect(wethBalancesAfter.seaportModule).to.eq(0);
  });

  it("Approval orders via `SeaportApprovalOrderZone` cannot be front-run", async () => {
    // Setup

    // Giver: Alice
    // Receiver: Bob

    const approval: SeaportERC721Approval = {
      giver: alice,
      filler: seaportModule.address,
      nft: {
        kind: "erc721",
        contract: erc721,
        id: getRandomInteger(1, 10000),
      },
      zone: seaportApprovalOrderZone.address,
    };
    await setupSeaportERC721Approvals([approval]);

    // Prepare executions

    const executions: ExecutionInfo[] = [
      {
        module: seaportModule.address,
        data: seaportModule.interface.encodeFunctionData("matchOrders", [
          [
            // Regular order
            {
              parameters: {
                ...approval.orders![0].params,
                totalOriginalConsiderationItems:
                  approval.orders![0].params.consideration.length,
              },
              signature: approval.orders![0].params.signature,
            },
            // Mirror order
            {
              parameters: {
                ...approval.orders![1].params,
                totalOriginalConsiderationItems:
                  approval.orders![1].params.consideration.length,
              },
              signature: "0x",
            },
          ],
          // Match the single offer item to the single consideration item
          [
            {
              offerComponents: [
                {
                  orderIndex: 0,
                  itemIndex: 0,
                },
              ],
              considerationComponents: [
                {
                  orderIndex: 0,
                  itemIndex: 0,
                },
              ],
            },
          ],
        ]),
        value: 0,
      },
    ];

    // Checks

    // The custom zone will enforce that no one other than the approval
    // order's offerer can be the relayer of the transaction
    await expect(
      router.connect(carol).execute(executions, {
        value: executions
          .map(({ value }) => value)
          .reduce((a, b) => bn(a).add(b), bn(0)),
      })
    ).to.be.revertedWith(
      "reverted with custom error 'UnsuccessfulExecution()'"
    );

    // Execute

    await router.connect(alice).execute(executions, {
      value: executions
        .map(({ value }) => value)
        .reduce((a, b) => bn(a).add(b), bn(0)),
    });

    // Checks

    // The Seaport module got the NFT
    expect(await approval.nft.contract.ownerOf(approval.nft.id)).to.eq(
      seaportModule.address
    );
  });

  it("Fill offer for single token approval-less", async () => {
    // Setup

    // Offer maker: Alice
    // Offer taker: Bob

    const offer: SeaportOffer = {
      buyer: alice,
      nft: {
        kind: "erc721",
        contract: erc721,
        id: getRandomInteger(1, 10000),
      },
      price: parseEther(getRandomFloat(0.0001, 2).toFixed(6)),
    };
    await setupSeaportOffers([offer]);

    await erc721.connect(bob).mint(offer.nft.id);

    // Prepare executions

    const executions: ExecutionInfo[] = [
      {
        module: seaportModule.address,
        data: seaportModule.interface.encodeFunctionData("acceptERC721Offer", [
          {
            parameters: {
              ...offer.order!.params,
              totalOriginalConsiderationItems:
                offer.order!.params.consideration.length,
            },
            numerator: 1,
            denominator: 1,
            signature: offer.order!.params.signature,
            extraData: "0x",
          },
          [],
          {
            fillTo: bob.address,
            refundTo: bob.address,
            revertIfIncomplete: true,
          },
          [],
        ]),
        value: 0,
      },
    ];

    // Fetch pre-state

    const balancesBefore = await getBalances(
      Sdk.Common.Addresses.Weth[chainId]
    );

    // Execute

    await erc721
      .connect(bob)
      ["safeTransferFrom(address,address,uint256,bytes)"](
        bob.address,
        seaportModule.address,
        offer.nft.id,
        router.interface.encodeFunctionData("execute", [executions])
      );

    // Fetch post-state

    const balancesAfter = await getBalances(Sdk.Common.Addresses.Weth[chainId]);

    // Checks

    // Bob got the payment
    expect(balancesAfter.bob.sub(balancesBefore.bob)).to.eq(offer.price);

    // Alice got the NFT
    expect(await offer.nft.contract.ownerOf(offer.nft.id)).to.eq(alice.address);

    // Router is stateless
    expect(balancesAfter.router).to.eq(0);
    expect(balancesAfter.seaportModule).to.eq(0);
  });

  it("Fill WETH offer with unwrapping", async () => {
    // Setup

    // Offer maker: Alice
    // Offer taker: Bob

    const offer: SeaportOffer = {
      buyer: alice,
      nft: {
        kind: "erc721",
        contract: erc721,
        id: getRandomInteger(1, 10000),
      },
      price: parseEther(getRandomFloat(0.0001, 2).toFixed(6)),
    };
    await setupSeaportOffers([offer]);

    await erc721.connect(bob).mint(offer.nft.id);

    // Prepare executions

    const executions: ExecutionInfo[] = [
      {
        module: seaportModule.address,
        data: seaportModule.interface.encodeFunctionData("acceptERC721Offer", [
          {
            parameters: {
              ...offer.order!.params,
              totalOriginalConsiderationItems:
                offer.order!.params.consideration.length,
            },
            numerator: 1,
            denominator: 1,
            signature: offer.order!.params.signature,
            extraData: "0x",
          },
          [],
          {
            // Route funds to the module for unwrapping WETH
            fillTo: wethModule.address,
            refundTo: bob.address,
            revertIfIncomplete: true,
          },
          [],
        ]),
        value: 0,
      },
      {
        module: wethModule.address,
        data: wethModule.interface.encodeFunctionData("unwrap", [bob.address]),
        value: 0,
      },
    ];

    // Fetch pre-state

    const ethBalancesBefore = await getBalances(
      Sdk.Common.Addresses.Eth[chainId]
    );
    const wethBalancesBefore = await getBalances(
      Sdk.Common.Addresses.Weth[chainId]
    );

    // Execute

    const ethPaidOnGas = await erc721
      .connect(bob)
      ["safeTransferFrom(address,address,uint256,bytes)"](
        bob.address,
        seaportModule.address,
        offer.nft.id,
        router.interface.encodeFunctionData("execute", [executions])
      )
      .then((tx: TransactionResponse) => tx.wait())
      .then((tx: TransactionReceipt) => tx.effectiveGasPrice.mul(tx.gasUsed));

    // Fetch post-state

    const ethBalancesAfter = await getBalances(
      Sdk.Common.Addresses.Eth[chainId]
    );
    const wethBalancesAfter = await getBalances(
      Sdk.Common.Addresses.Weth[chainId]
    );

    // Checks

    // Bob got the payment in ETH, not WETH
    expect(
      ethBalancesAfter.bob.sub(ethBalancesBefore.bob).add(ethPaidOnGas)
    ).to.eq(offer.price);
    expect(wethBalancesAfter.bob.sub(wethBalancesBefore.bob)).to.eq(0);

    // Alice got the NFT
    expect(await offer.nft.contract.ownerOf(offer.nft.id)).to.eq(alice.address);

    // Router is stateless
    expect(ethBalancesAfter.router).to.eq(0);
    expect(ethBalancesAfter.seaportModule).to.eq(0);
    expect(ethBalancesAfter.wethModule).to.eq(0);
    expect(wethBalancesAfter.router).to.eq(0);
    expect(wethBalancesAfter.seaportModule).to.eq(0);
    expect(wethBalancesAfter.wethModule).to.eq(0);
  });

  it("Fill with balance assert", async () => {
    // Setup

    // Listing maker: Alice
    // Listing taker: Bob

    const listing: SeaportListing = {
      seller: alice,
      nft: {
        kind: "erc721",
        contract: erc721,
        id: getRandomInteger(1, 10000),
      },
      price: parseEther(getRandomFloat(0.0001, 2).toFixed(6)),
    };
    await setupSeaportListings([listing]);

    // Transfer the NFT so that the order is not fillable
    await erc721
      .connect(alice)
      .transferFrom(alice.address, carol.address, listing.nft.id);

    // Prepare executions

    const executions: ExecutionInfo[] = [
      {
        module: balanceAssertModule.address,
        data: balanceAssertModule.interface.encodeFunctionData(
          "assertERC721Owner",
          [listing.nft.contract.address, listing.nft.id, alice.address]
        ),
        value: 0,
      },
      {
        module: seaportModule.address,
        data: seaportModule.interface.encodeFunctionData("acceptETHListing", [
          {
            parameters: {
              ...listing.order!.params,
              totalOriginalConsiderationItems:
                listing.order!.params.consideration.length,
            },
            numerator: 1,
            denominator: 1,
            signature: listing.order!.params.signature,
            extraData: "0x",
          },
          {
            fillTo: carol.address,
            refundTo: carol.address,
            revertIfIncomplete: true,
            amount: listing.price,
          },
          [],
        ]),
        value: listing.price,
      },
    ];

    // Execute

    await expect(
      router.connect(alice).execute(executions, {
        value: executions
          .map(({ value }) => value)
          .reduce((a, b) => bn(a).add(b), bn(0)),
      })
    ).to.be.revertedWith(
      "reverted with custom error 'UnsuccessfulExecution()'"
    );

    // Transfer the NFT back so that the order is fillable again
    await erc721
      .connect(carol)
      .transferFrom(carol.address, alice.address, listing.nft.id);

    // Execute

    await router.connect(bob).execute(executions, {
      value: executions
        .map(({ value }) => value)
        .reduce((a, b) => bn(a).add(b), bn(0)),
    });
  });
});

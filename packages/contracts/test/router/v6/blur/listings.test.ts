import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Sdk from "@reservoir0x/sdk/src";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import { ExecutionInfo } from "../helpers/router";
import { BlurListing, setupBlurListings } from "../helpers/blur";
import {
  bn,
  getChainId,
  getRandomBoolean,
  getRandomFloat,
  getRandomInteger,
  reset,
  setupNFTs,
} from "../../../utils";

describe("[ReservoirV6_0_0] Blur listings", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let david: SignerWithAddress;
  let emilio: SignerWithAddress;

  let erc721: Contract;
  let router: Contract;
  let blurModule: Contract;

  beforeEach(async () => {
    [deployer, alice, bob, carol, david, emilio] = await ethers.getSigners();

    ({ erc721 } = await setupNFTs(deployer));

    router = await ethers
      .getContractFactory("ReservoirV6_0_0", deployer)
      .then((factory) => factory.deploy());
    blurModule = await ethers
      .getContractFactory("BlurModule", deployer)
      .then((factory) => factory.deploy(router.address, router.address));
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
        blurModule: await ethers.provider.getBalance(blurModule.address),
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
        blurModule: await contract.getBalance(blurModule.address),
      };
    }
  };

  afterEach(reset);

  const testAcceptListings = async (
    // Whether to include fees on top
    chargeFees: boolean,
    // Whether to revert or not in case of any failures
    revertIfIncomplete: boolean,
    // Whether to cancel some orders in order to trigger partial filling
    partial: boolean,
    // Number of listings to fill
    listingsCount: number
  ) => {
    // Setup

    // Makers: Alice and Bob
    // Taker: Carol
    // Fee recipient: Emilio

    const listings: BlurListing[] = [];
    const feesOnTop: BigNumber[] = [];
    for (let i = 0; i < listingsCount; i++) {
      listings.push({
        seller: getRandomBoolean() ? alice : bob,
        nft: {
          // TODO: Add support for ERC1155
          ...{ kind: "erc721", contract: erc721 },
          id: getRandomInteger(1, 10000),
        },
        price: parseEther(getRandomFloat(0.0001, 2).toFixed(6)),
        isCancelled: partial && getRandomBoolean(),
      });
      if (chargeFees) {
        feesOnTop.push(parseEther(getRandomFloat(0.0001, 0.1).toFixed(6)));
      }
    }

    await setupBlurListings(listings);

    // Prepare executions
    const totalPrice = bn(listings.map(({ price }) => price).reduce((a, b) => bn(a).add(b), bn(0)));

    const executions: ExecutionInfo[] = [
      // 1. Fill listings
      listingsCount > 1
        ? {
            module: blurModule.address,
            data: blurModule.interface.encodeFunctionData("acceptETHListings", [
              listings.map((listing) => listing.order!.getRaw()),
              listings.map((listing) =>
                listing.order!.buildMatching({
                  trader: blurModule.address,
                })
              ),
              {
                fillTo: carol.address,
                refundTo: carol.address,
                revertIfIncomplete,
                amount: totalPrice,
              },
              [
                ...feesOnTop.map((amount) => ({
                  recipient: emilio.address,
                  amount,
                })),
              ],
            ]),
            value: totalPrice.add(
              // Anything on top should be refunded
              feesOnTop.reduce((a, b) => bn(a).add(b), bn(0)).add(parseEther("0.1"))
            ),
          }
        : {
            module: blurModule.address,
            data: blurModule.interface.encodeFunctionData("acceptETHListing", [
              listings[0].order!.getRaw(),
              listings[0].order!.buildMatching({
                trader: blurModule.address,
              }),
              {
                fillTo: carol.address,
                refundTo: carol.address,
                revertIfIncomplete,
                amount: totalPrice,
              },
              chargeFees
                ? feesOnTop.map((amount) => ({
                    recipient: emilio.address,
                    amount,
                  }))
                : [],
            ]),
            value: totalPrice.add(
              // Anything on top should be refunded
              feesOnTop.reduce((a, b) => bn(a).add(b), bn(0)).add(parseEther("0.1"))
            ),
          },
    ];

    // Checks

    // If the `revertIfIncomplete` option is enabled and we have any
    // orders that are not fillable, the whole transaction should be
    // reverted
    if (partial && revertIfIncomplete && listings.some(({ isCancelled }) => isCancelled)) {
      await expect(
        router.connect(carol).execute(executions, {
          value: executions.map(({ value }) => value).reduce((a, b) => bn(a).add(b), bn(0)),
        })
      ).to.be.revertedWith("reverted with custom error 'UnsuccessfulExecution()'");

      return;
    }

    // Fetch pre-state

    const ethBalancesBefore = await getBalances(Sdk.Common.Addresses.Eth[chainId]);

    // Execute
    await router.connect(carol).execute(executions, {
      value: executions.map(({ value }) => value).reduce((a, b) => bn(a).add(b), bn(0)),
    });

    // Fetch post-state

    const ethBalancesAfter = await getBalances(Sdk.Common.Addresses.Eth[chainId]);

    const wethBalancesAfter = await getBalances(Sdk.Common.Addresses.Weth[chainId]);

    const aliceOrderList = listings.filter(
      ({ seller, isCancelled }) => !isCancelled && seller.address === alice.address
    );

    const aliceOrderSum = aliceOrderList
      .map(({ price }) => bn(price))
      .reduce((a, b) => bn(a).add(b), bn(0));

    const bobOrderList = listings.filter(
      ({ seller, isCancelled }) => !isCancelled && seller.address === bob.address
    );

    const bobOrderSum = bobOrderList
      .map(({ price }) => bn(price))
      .reduce((a, b) => bn(a).add(b), bn(0));

    // Checks
    const aliceBalance = ethBalancesAfter.alice.sub(ethBalancesBefore.alice);
    const bobBalance = ethBalancesAfter.bob.sub(ethBalancesBefore.bob);
    const emilioBalance = ethBalancesAfter.emilio.sub(ethBalancesBefore.emilio);

    // Alice got the payment
    expect(aliceBalance).to.eq(aliceOrderSum);

    // Bob got the payment
    expect(bobBalance).to.eq(bobOrderSum);

    // Emilio got the fee payments
    if (chargeFees) {
      // Fees are charged per execution, and since we have a single execution
      // here, we will have a single fee payment at the end adjusted over the
      // amount that was actually paid (eg. prices of filled orders)
      const actualPaid = listings
        .filter(({ isCancelled }) => !isCancelled)
        .map(({ price }) => price)
        .reduce((a, b) => bn(a).add(b), bn(0));

      const chargeFeeSum = listings
        .map((_, i) => feesOnTop[i].mul(actualPaid).div(totalPrice))
        .reduce((a, b) => bn(a).add(b), bn(0));

      expect(emilioBalance).to.eq(chargeFeeSum);
    }

    // Carol got the NFTs from all filled orders
    for (let i = 0; i < listings.length; i++) {
      const nft = listings[i].nft;
      if (!listings[i].isCancelled) {
        if (nft.kind === "erc721") {
          expect(await nft.contract.ownerOf(nft.id)).to.eq(carol.address);
        } else {
          expect(await nft.contract.balanceOf(carol.address, nft.id)).to.eq(1);
        }
      } else {
        if (nft.kind === "erc721") {
          expect(await nft.contract.ownerOf(nft.id)).to.eq(listings[i].seller.address);
        } else {
          expect(await nft.contract.balanceOf(listings[i].seller.address, nft.id)).to.eq(1);
        }
      }
    }

    // Router is stateless
    expect(wethBalancesAfter.router).to.eq(0);
    expect(wethBalancesAfter.blurModule).to.eq(0);
    expect(ethBalancesAfter.router).to.eq(0);
    expect(ethBalancesAfter.blurModule).to.eq(0);
  };

  for (const multiple of [false, true]) {
    for (const partial of [false, true]) {
      for (const chargeFees of [false, true]) {
        for (const revertIfIncomplete of [false, true]) {
          it(
            "[eth]" +
              `${multiple ? "[multiple-orders]" : "[single-order]"}` +
              `${partial ? "[partial]" : "[full]"}` +
              `${chargeFees ? "[fees]" : "[no-fees]"}` +
              `${revertIfIncomplete ? "[reverts]" : "[skip-reverts]"}`,
            async () =>
              testAcceptListings(
                chargeFees,
                revertIfIncomplete,
                partial,
                multiple ? getRandomInteger(2, 6) : 1
              )
          );
        }
      }
    }
  }
});

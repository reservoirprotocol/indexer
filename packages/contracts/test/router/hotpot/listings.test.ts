import { BigNumber } from "@ethersproject/bignumber";
import { HashZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Sdk from "@reservoir0x/sdk/src";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import { ExecutionInfo } from "../helpers/router";
import * as Hotpot from "../helpers/hotpot";
import {
  bn,
  getChainId,
  getRandomBoolean,
  getRandomFloat,
  getRandomInteger,
  reset,
  setupNFTs,
} from "../../utils";

describe("[ReservoirV6_0_1] Hotpot listings", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let david: SignerWithAddress;
  let emilio: SignerWithAddress;

  let erc1155: Contract;
  let erc721: Contract;
  let router: Contract;
  let HotpotModule: Contract;

  beforeEach(async () => {
    [deployer, alice, bob, carol, david, emilio] = await ethers.getSigners();

    ({ erc721, erc1155 } = await setupNFTs(deployer));

    router = await ethers
      .getContractFactory("ReservoirV6_0_1", deployer)
      .then((factory) => factory.deploy());
    HotpotModule = await ethers
      .getContractFactory("HotpotModule", deployer)
      .then((factory) =>
        factory.deploy(deployer.address, router.address, Sdk.Hotpot.Addresses.Exchange[chainId])
      );
  });

  const getBalances = async () => {
    return {
      alice: await ethers.provider.getBalance(alice.address),
      bob: await ethers.provider.getBalance(bob.address),
      carol: await ethers.provider.getBalance(carol.address),
      david: await ethers.provider.getBalance(david.address),
      emilio: await ethers.provider.getBalance(emilio.address),
      router: await ethers.provider.getBalance(router.address),
      HotpotModule: await ethers.provider.getBalance(HotpotModule.address),
    };
  };

  afterEach(reset);

  const testAcceptListings = async (
    // Whether to include fees on top
    chargeFees: boolean,
    // Whether to cancel some orders in order to trigger partial filling
    partial: boolean,
    // Number of listings to fill
    listingsCount: number
  ) => {
    // Setup

    // Makers: Alice and Bob
    // Taker: Carol
    // Fee recipient: Emilio

    const listings: Hotpot.Listing[] = [];
    const feesOnTop: BigNumber[] = [];
    for (let i = 0; i < listingsCount; i++) {
      listings.push({
        seller: getRandomBoolean() ? alice : bob,
        nft: {
          ...(getRandomBoolean()
            ? { kind: "erc721", contract: erc721 }
            : { kind: "erc1155", contract: erc1155 }),
          id: getRandomInteger(1, 10000),
        },
        price: parseEther(getRandomFloat(0.0001, 2).toFixed(6)),
        isCancelled: partial && getRandomBoolean(), // imitate partial buy - cancel listings that are not filled
      });
      if (chargeFees) {
        feesOnTop.push(parseEther(getRandomFloat(0.0001, 0.1).toFixed(6)));
      }
    }
    await Hotpot.setupListings(listings, carol);

    // Prepare executions
    // totalPrice does not include fees on top

    const totalPrice = bn(listings.map(({ price }) => price).reduce((a, b) => bn(a).add(b), bn(0)));
    const executions: ExecutionInfo[] = [
      // 1. Fill listings
      listingsCount > 1
        ? {
            module: HotpotModule.address,
            data: HotpotModule.interface.encodeFunctionData("acceptETHListings", [
              listings.map((listing) => listing.order!.getExchangeOrderParams()),
              {
                fillTo: carol.address,
                refundTo: carol.address,
                revertIfIncomplete: true,
                amount: totalPrice,
              },
              [
              chargeFees ? 
                feesOnTop.map((amount) => ({
                  recipient: emilio.address,
                  amount,
                })) : 
                [],
              ],
            ]),
            value: totalPrice.add(
              // Anything on top should be refunded
              feesOnTop.reduce((a, b) => bn(a).add(b), bn(0)).add(parseEther("0.1"))
            ),
          }
        : {
            module: HotpotModule.address,
            data: HotpotModule.interface.encodeFunctionData("acceptETHListing", [
              listings[0].order!.getExchangeOrderParams(),
              {
                fillTo: carol.address,
                refundTo: carol.address,
                revertIfIncomplete: true,
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
    if (partial && listings.some(({ isCancelled }) => isCancelled)) {
      await expect(
        router.connect(carol).execute(executions, {
          value: executions.map(({ value }) => value).reduce((a, b) => bn(a).add(b), bn(0)),
        })
      ).to.be.reverted;

      return;
    }

    // Fetch pre-state

    const ethBalancesBefore = await getBalances();

    // Execute

    await router.connect(carol).execute(executions, {
      value: executions.map(({ value }) => value).reduce((a, b) => bn(a).add(b), bn(0)),
    });

    // Fetch post-state

    const ethBalancesAfter = await getBalances();

    // Checks

    const exchange = new Sdk.Hotpot.Exchange(chainId);
    // Alice got the payment
    const alices_payments = listings
      .filter(({ seller, isCancelled }) => !isCancelled && seller.address === alice.address)
      .map(async ({ price, order }) => {
        const raffle_fee = await exchange.calculateRaffleFee(ethers.provider, order!.params);
        return bn(price).sub(raffle_fee)
      });
    const total_alices_payment = (await Promise.all(alices_payments)).reduce(
      (a, b) => bn(a).add(b), bn(0)
    );
    expect(ethBalancesAfter.alice.sub(ethBalancesBefore.alice)).to.eq(
      total_alices_payment
    );

    // Bob got the payment
    const bobs_payments = listings
      .filter(({ seller, isCancelled }) => !isCancelled && seller.address === bob.address)
      .map(async ({ price, order }) => {
        const raffle_fee = await exchange.calculateRaffleFee(ethers.provider, order!.params);
        return bn(price).sub(raffle_fee)
      });
    const total_bobs_payment = (await Promise.all(bobs_payments)).reduce(
      (a, b) => bn(a).add(b), bn(0)
    );
    expect(ethBalancesAfter.bob.sub(ethBalancesBefore.bob)).to.eq(
      total_bobs_payment
    );

    // Emilio got the fee payments
    if (chargeFees) {
      // Fees are charged per execution, and since we have a single execution
      // here, we will have a single fee payment at the end adjusted over the
      // amount that was actually paid (eg. prices of filled orders)
      const actualPaid = listings
        .filter(({ isCancelled }) => !isCancelled)
        .map(({ price }) => price)
        .reduce((a, b) => bn(a).add(b), bn(0));
      expect(ethBalancesAfter.emilio.sub(ethBalancesBefore.emilio)).to.eq(
        listings
          .map((_, i) => feesOnTop[i].mul(actualPaid).div(totalPrice))
          .reduce((a, b) => bn(a).add(b), bn(0))
      );
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
    expect(ethBalancesAfter.router).to.eq(0);
    expect(ethBalancesAfter.HotpotModule).to.eq(0);
  };

  for (const multiple of [false, true]) {
    for (const partial of [false, true]) {
      for (const chargeFees of [false, true]) {
        it(
          "[eth]" +
            `${multiple ? "[multiple-orders]" : "[single-order]"}` +
            `${partial ? "[partial]" : "[full]"}` +
            `${chargeFees ? "[fees]" : "[no-fees]"}`,
          async () =>
            testAcceptListings(
              chargeFees,
              partial,
              multiple ? getRandomInteger(2, 6) : 1
            )
        );
      }
    }
  }
});

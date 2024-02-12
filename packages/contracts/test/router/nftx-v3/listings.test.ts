import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { formatEther, parseEther } from "@ethersproject/units";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import * as Sdk from "@reservoir0x/sdk/src";
import { expect } from "chai";
import { ethers } from "hardhat";
import { ContractTransaction } from "ethers";

import { NFTXV3Listing, setupNFTXV3Listings } from "../helpers/nftx-v3";
import { ExecutionInfo } from "../helpers/router";
import {
  bn,
  getChainId,
  getRandomBoolean,
  getRandomFloat,
  getRandomInteger,
  reset,
  setupNFTs,
} from "../../utils";

describe("[ReservoirV6_0_1] NFTXV3 listings", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let david: SignerWithAddress;
  let emilio: SignerWithAddress;

  let erc721: Contract;
  let router: Contract;
  let nftxV3Module: Contract;

  beforeEach(async () => {
    [deployer, alice, bob, carol, david, emilio] = await ethers.getSigners();

    ({ erc721 } = await setupNFTs(deployer));

    router = await ethers
      .getContractFactory("ReservoirV6_0_1", deployer)
      .then((factory) => factory.deploy());
    nftxV3Module = await ethers
      .getContractFactory("NFTXV3Module", deployer)
      .then((factory) =>
        factory.deploy(
          deployer.address,
          router.address,
          Sdk.NftxV3.Addresses.MarketplaceZap[chainId]
        )
      );
  });

  const getBalances = async (token: string) => {
    if (token === Sdk.Common.Addresses.Native[chainId]) {
      return {
        alice: await ethers.provider.getBalance(alice.address),
        bob: await ethers.provider.getBalance(bob.address),
        carol: await ethers.provider.getBalance(carol.address),
        david: await ethers.provider.getBalance(david.address),
        emilio: await ethers.provider.getBalance(emilio.address),
        router: await ethers.provider.getBalance(router.address),
        nftxV3Module: await ethers.provider.getBalance(nftxV3Module.address),
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
        nftxV3Module: await contract.getBalance(nftxV3Module.address),
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

    const listings: NFTXV3Listing[] = [];
    const feesOnTop: BigNumber[] = [];
    for (let i = 0; i < listingsCount; i++) {
      listings.push({
        seller: getRandomBoolean() ? alice : bob,
        nft: {
          contract: erc721,
          id: getRandomInteger(1, 100000),
        },
        price: parseEther(getRandomFloat(0.0001, 2).toFixed(6)),
        isCancelled: partial && getRandomBoolean(),
      });

      if (chargeFees) {
        feesOnTop.push(parseEther(getRandomFloat(0.0001, 0.1).toFixed(6)));
      }
    }

    await setupNFTXV3Listings(listings);

    // Prepare executions

    const totalPrice = bn(
      listings
        .map(({ price }) =>
          // The protocol fee should be paid on top of the price
          bn(price).add(bn(price).mul(50).div(10000))
        )
        .reduce((a, b) => bn(a).add(b), bn(0))
    );

    const executions: ExecutionInfo[] = [
      // 1. Fill listings
      {
        module: nftxV3Module.address,
        data: nftxV3Module.interface.encodeFunctionData("buyWithETH", [
          listings.map((listing) => listing.order!.params),
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
          gasLimit: 8_000_000,
        })
      ).to.be.revertedWith("reverted with custom error 'UnsuccessfulExecution()'");

      return;
    }

    const ethBalancesBefore = await getBalances(Sdk.Common.Addresses.Native[chainId]);

    // Execute
    // const tx =
    (await router.connect(carol).execute(executions, {
      value: executions.map(({ value }) => value).reduce((a, b) => bn(a).add(b), bn(0)),
      gasLimit: 8_000_000,
    })) as ContractTransaction;
    // const txRes = await tx.wait();

    // Fetch post-state
    const ethBalancesAfter = await getBalances(Sdk.Common.Addresses.Native[chainId]);

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
    const emilioBalance = ethBalancesAfter.emilio.sub(ethBalancesBefore.emilio);
    // carolSpend = gasFees + ETH paid to buy NFTs
    const carolSpend = ethBalancesBefore.carol.sub(ethBalancesAfter.carol);

    // console.log({
    //   aliceOrderSum: aliceOrderSum.toString(),
    //   bobOrderSum: bobOrderSum.toString(),
    //   carolSpend: carolSpend.toString(),
    // });

    const orderSum = aliceOrderSum.add(bobOrderSum);
    const diffPercent =
      (parseFloat(formatEther(orderSum.sub(carolSpend))) / parseFloat(formatEther(carolSpend))) *
      100;

    // Check Carol balance
    const defaultSlippage = 5;
    expect(diffPercent).to.lte(defaultSlippage);

    // console.log({ diffPercent: diffPercent.toString() });

    // Emilio got the fee payments
    if (chargeFees) {
      // Fees are charged per execution, and since we have a single execution
      // here, we will have a single fee payment at the end adjusted over the
      // amount that was actually paid (eg. prices of filled orders)
      let actualPaid = listings
        .filter(({ isCancelled }) => !isCancelled)
        .map(({ price }) => price)
        .reduce((a, b) => bn(a).add(b), bn(0));
      // getPoolPrice has 100 bps slippage added on top, so removing it here
      actualPaid = bn(actualPaid).mul(bn(9000)).div(bn(10100));
      // const actualPaid = carolSpend.sub(txRes.cumulativeGasUsed.mul(txRes.effectiveGasPrice));

      const chargeFeeSum = listings
        .map((_, i) => feesOnTop[i].mul(actualPaid).div(totalPrice))
        .reduce((a, b) => bn(a).add(b), bn(0));

      expect(emilioBalance).to.gte(chargeFeeSum);
    }

    // Carol got the NFTs from all filled orders
    for (let i = 0; i < listings.length; i++) {
      const nft = listings[i].nft;
      if (!listings[i].isCancelled) {
        expect(await nft.contract.ownerOf(nft.id)).to.eq(carol.address);
      } else {
        expect(await nft.contract.ownerOf(nft.id)).to.eq(listings[i].vault);
      }
    }

    // Router is stateless
    expect(ethBalancesAfter.router).to.eq(0);
    expect(ethBalancesAfter.nftxV3Module).to.eq(0);
  };

  for (const multiple of [false, true]) {
    for (const partial of [false, true]) {
      for (const chargeFees of [false, true]) {
        for (const revertIfIncomplete of [true, false]) {
          const testName =
            "[eth]" +
            `${multiple ? "[multiple-orders]" : "[single-order]"}` +
            `${partial ? "[partial]" : "[full]"}` +
            `${chargeFees ? "[fees]" : "[no-fees]"}` +
            `${revertIfIncomplete ? "[reverts]" : "[skip-reverts]"}`;

          it(testName, async () =>
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

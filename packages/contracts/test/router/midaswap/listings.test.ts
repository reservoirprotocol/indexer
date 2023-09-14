import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Sdk from "@reservoir0x/sdk/src";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import { ExecutionInfo } from "../helpers/router";
import { MidaswapListing, setupMidaswapListings } from "../helpers/midaswap";
import {
  bn,
  getChainId,
  getRandomBoolean,
  getRandomFloat,
  getRandomInteger,
  reset,
  setupNFTs,
} from "../../utils";

import LPTokenAbi from "@reservoir0x/sdk/src/midaswap/abis/LPToken.json";
import RouterAbi from "@reservoir0x/sdk/src/midaswap/abis/Router.json";

describe("[ReservoirV6_0_1] Midaswap listings", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let david: SignerWithAddress;
  let emilio: SignerWithAddress;

  let erc721: Contract;
  let router: Contract;
  let midaRouter: Contract;
  let midaswapModule: Contract;
  const deadline = Date.now() + 100 * 24 * 60 * 60 * 1000;

  beforeEach(async () => {
    [deployer, alice, bob, carol, david, emilio] = await ethers.getSigners();

    ({ erc721 } = await setupNFTs(deployer));

    router = await ethers
      .getContractFactory("ReservoirV6_0_1", deployer)
      .then((factory) => factory.deploy());
    midaswapModule = await ethers
      .getContractFactory("MidaswapModule", deployer)
      .then((factory) =>
        factory.deploy(
          deployer.address,
          router.address,
          Sdk.Midaswap.Addresses.PairFactory[chainId],
          Sdk.Midaswap.Addresses.Router[chainId],
          Sdk.Common.Addresses.WNative[chainId]
        )
      );
    midaRouter = new Contract(Sdk.Midaswap.Addresses.Router[chainId], RouterAbi, ethers.provider);
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
        midaswapModule: await ethers.provider.getBalance(midaswapModule.address),
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
        midaswapModule: await contract.getBalance(midaswapModule.address),
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

    const listings: MidaswapListing[] = [];
    const feesOnTop: BigNumber[] = [];
    const bin = getRandomInteger(8298609, 8395540);
    const swapPrice = Sdk.Midaswap.Order.binToPriceFixed(bin);
    for (let i = 0; i < listingsCount; i++) {
      const isCancelled = partial && getRandomBoolean();
      if (!isCancelled) {
        listings.push({
          seller: getRandomBoolean() ? alice : bob,
          nft: {
            contract: erc721,
            id: getRandomInteger(1, 10000),
          },
          price: parseEther(swapPrice),
          bin,
          isCancelled,
          lpInfo: {
            lpAddress: "",
            lpTokenId: 0,
            pairAddress: "",
          },
        });
        if (chargeFees) {
          feesOnTop.push(parseEther(getRandomFloat(0.0001, 0.1).toFixed(6)));
        }
      }
    }
    if (listings.length === 0) {
      return;
    }

    await setupMidaswapListings(listings);

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
        module: midaswapModule.address,
        data: midaswapModule.interface.encodeFunctionData("buyWithETH", [
          listings.map((listing) => listing.order!.params.tokenX),
          listings.map((listing) => listing.nft.id),
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
        })
      ).to.be.revertedWith("reverted with custom error 'UnsuccessfulExecution()'");

      return;
    }

    // Fetch pre-state
    const lpContract = new Contract(listings[0].lpInfo.lpAddress, LPTokenAbi, ethers.provider);
    const approve = await lpContract.connect(alice).setApprovalForAll(midaRouter.address, true);
    await approve.wait();
    const boxApprove = await lpContract.connect(bob).setApprovalForAll(midaRouter.address, true);
    await boxApprove.wait();

    const ethBalancesBefore = await getBalances(Sdk.Common.Addresses.Native[chainId]);

    // Execute

    await router.connect(carol).execute(executions, {
      value: executions.map(({ value }) => value).reduce((a, b) => bn(a).add(b), bn(0)),
    });
    let AliceRemoveLpAllGasUsed = bn(0);
    let BobRemoveLpAllGasUsed = bn(0);
    for (const { seller, lpInfo } of listings) {
      const remove = await midaRouter
        .connect(seller)
        .removeLiquidityETH(
          erc721.address,
          Sdk.Common.Addresses.WNative[chainId],
          lpInfo.lpTokenId,
          deadline
        );
      const txReceipt = await ethers.provider.getTransactionReceipt(remove.hash);
      const gasUsed = txReceipt.cumulativeGasUsed.mul(txReceipt.effectiveGasPrice);
      if (seller === alice) {
        AliceRemoveLpAllGasUsed = gasUsed.add(AliceRemoveLpAllGasUsed);
      }
      if (seller === bob) {
        BobRemoveLpAllGasUsed = gasUsed.add(BobRemoveLpAllGasUsed);
      }
      await remove.wait();
    }

    // Fetch post-state

    const ethBalancesAfter = await getBalances(Sdk.Common.Addresses.Native[chainId]);

    // Checks

    // Alice got the payment
    const aliceTxs = listings.filter(
      ({ seller, isCancelled }) => !isCancelled && seller.address === alice.address
    );
    const aliceTargetPrice = aliceTxs
      .map(({ price }) => price)
      .reduce((a, b) => bn(a).add(b), bn(0));

    const AliceLiquidityLpFee = bn(aliceTargetPrice).mul(45).div(10000);
    expect(
      ethBalancesAfter.alice
        .sub(ethBalancesBefore.alice)
        .add(AliceRemoveLpAllGasUsed)
        .sub(AliceLiquidityLpFee)
        .div(10000000)
    ).to.eq(bn(aliceTargetPrice).div(10000000));
    const bobTxs = listings.filter(
      ({ seller, isCancelled }) => !isCancelled && seller.address === bob.address
    );
    const BobTargetPrice = bobTxs.map(({ price }) => price).reduce((a, b) => bn(a).add(b), bn(0));
    const BobLiquidityLpFee = bn(BobTargetPrice).mul(45).div(10000);
    // Bob got the payment
    expect(
      ethBalancesAfter.bob
        .sub(ethBalancesBefore.bob)
        .add(BobRemoveLpAllGasUsed)
        .sub(BobLiquidityLpFee)
        .div(10000000)
    ).to.eq(bn(BobTargetPrice).div(10000000));

    // Emilio got the fee payments
    if (chargeFees) {
      // Fees are charged per execution, and since we have a single execution
      // here, we will have a single fee payment at the end adjusted over the
      // amount that was actually paid (eg. prices of filled orders)
      const actualPaid = listings
        .filter(({ isCancelled }) => !isCancelled)
        .map(({ price }) => bn(price).add(bn(price).mul(50).div(10000)))
        .reduce((a, b) => bn(a).add(b), bn(0));
      const fee = listings
        .map((_, i) => feesOnTop[i].mul(actualPaid).div(totalPrice))
        .reduce((a, b) => bn(a).add(b), bn(0));
      // There's some precision issues we need to adjust to
      expect(
        ethBalancesAfter.emilio.sub(ethBalancesBefore.emilio).div(1000).sub(bn(fee).div(1000)).abs()
      ).to.lt(1000000);
    }

    // Carol got the NFTs from all filled orders
    for (let i = 0; i < listings.length; i++) {
      const nft = listings[i].nft;
      if (!listings[i].isCancelled) {
        expect(await nft.contract.ownerOf(nft.id)).to.eq(carol.address);
      } else {
        expect(await nft.contract.ownerOf(nft.id)).to.eq(listings[i].seller.address);
      }
    }

    // Router is stateless
    expect(ethBalancesAfter.router).to.eq(0);
    expect(ethBalancesAfter.midaswapModule).to.eq(0);
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

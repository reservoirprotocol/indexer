import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import * as Sdk from "@reservoir0x/sdk/src";
import { expect } from "chai";
import { ethers, network } from "hardhat";

import { NFTXListing } from "../helpers/nftx";
import { ExecutionInfo } from "../helpers/router";
import { bn, getChainId, getRandomBoolean, getRandomFloat, reset } from "../../utils";

describe("[ReservoirV6_0_1] NFTX listings (with 0x routing)", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let carol: SignerWithAddress;
  let emilio: SignerWithAddress;

  let router: Contract;
  let nftxZeroExModule: Contract;

  beforeEach(async () => {
    [deployer, alice, carol, emilio] = await ethers.getSigners();

    router = await ethers
      .getContractFactory("ReservoirV6_0_1", deployer)
      .then((factory) => factory.deploy());
    nftxZeroExModule = await ethers
      .getContractFactory("NFTXZeroExModule", deployer)
      .then((factory) =>
        factory.deploy(
          deployer.address,
          router.address,
          Sdk.Nftx.Addresses.ZeroExMarketplaceZap[chainId]
        )
      );
  });

  const getBalances = async (token: string) => {
    if (token === Sdk.Common.Addresses.Native[chainId]) {
      return {
        alice: await ethers.provider.getBalance(alice.address),
        carol: await ethers.provider.getBalance(carol.address),
        emilio: await ethers.provider.getBalance(emilio.address),
        router: await ethers.provider.getBalance(router.address),
        nftxZeroExModule: await ethers.provider.getBalance(nftxZeroExModule.address),
      };
    } else {
      const contract = new Sdk.Common.Helpers.Erc20(ethers.provider, token);
      return {
        alice: await contract.getBalance(alice.address),
        carol: await contract.getBalance(carol.address),
        emilio: await contract.getBalance(emilio.address),
        router: await contract.getBalance(router.address),
        nftxZeroExModule: await contract.getBalance(nftxZeroExModule.address),
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
    partial: boolean
  ) => {
    // Setup

    // Token owner = alice
    const owner = "0xc8c9771b59f9f217e8285889b9cdd7b9ddce0e86";
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [owner],
    });
    await network.provider.request({
      method: "hardhat_setBalance",
      params: [owner, "0x1000000000000000000"],
    });
    alice = await ethers.getSigner(owner);

    // Collection = milady
    const collection = "0x5af0d9827e0c53e4799bb226655a1de152a425a5";
    const vault = "0x227c7DF69D3ed1ae7574A1a7685fDEd90292EB48";
    const vaultId = 392;
    const tokensInVault = [7336, 8423];

    const listings: NFTXListing[] = [];
    const feesOnTop: BigNumber[] = [];
    for (let i = 0; i < tokensInVault.length; i++) {
      if (tokensInVault.length < i) {
        break;
      }

      const factory = await ethers.getContractFactory("MockERC721", deployer);
      const erc721 = factory.attach(collection);

      await erc721
        .connect(alice)
        .setApprovalForAll(Sdk.Nftx.Addresses.ZeroExMarketplaceZap[1], true);
      await erc721.connect(alice).setApprovalForAll(router.address, true);
      await erc721.connect(alice).setApprovalForAll(vault, true);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const listing: any = {
        seller: alice,
        nft: {
          contract: erc721,
          id: tokensInVault[i],
        },
        price: parseEther(getRandomFloat(0.0001, 2).toFixed(6)),
        isCancelled: partial && getRandomBoolean(),
      };

      const poolPrice = await Sdk.Nftx.Helpers.getPoolPriceFrom0x(
        vault,
        1,
        "buy",
        1000,
        ethers.provider
      );

      listing.price = bn(poolPrice.price);
      listing.vault = vault;
      listing.order = new Sdk.Nftx.Order(chainId, {
        vaultId: vaultId.toString(),
        collection: listing.nft.contract.address,
        pool: vault,
        specificIds: [listing.nft.id.toString()],
        amount: "1",
        path: [],
        swapCallData: poolPrice.swapCallData,
        price: listing.isCancelled ? "0" : listing.price.toString(),
        extra: {
          prices: [listing.price.toString()],
        },
      });

      listings.push(listing);

      if (chargeFees) {
        feesOnTop.push(parseEther(getRandomFloat(0.0001, 0.1).toFixed(6)));
      }
    }

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
        module: nftxZeroExModule.address,
        data: nftxZeroExModule.interface.encodeFunctionData("buyWithETH", [
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
        })
      ).to.be.revertedWith("reverted with custom error 'UnsuccessfulExecution()'");

      return;
    }

    // Execute

    await router.connect(carol).execute(executions, {
      value: executions.map(({ value }) => value).reduce((a, b) => bn(a).add(b), bn(0)),
    });

    // Fetch post-state

    const ethBalancesAfter = await getBalances(Sdk.Common.Addresses.Native[chainId]);

    // Checks

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
    expect(ethBalancesAfter.nftxZeroExModule).to.eq(0);
  };

  for (const partial of [false, true]) {
    for (const chargeFees of [false, true]) {
      for (const revertIfIncomplete of [true, false]) {
        const testName =
          "[eth]" +
          `${partial ? "[partial]" : "[full]"}` +
          `${chargeFees ? "[fees]" : "[no-fees]"}` +
          `${revertIfIncomplete ? "[reverts]" : "[skip-reverts]"}`;

        it(testName, async () => testAcceptListings(chargeFees, revertIfIncomplete, partial));
      }
    }
  }
});

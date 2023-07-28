import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Sdk from "@reservoir0x/sdk/src";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import { bn, getChainId, getRandomBoolean, getRandomFloat, reset, setupNFTs } from "../../utils";

describe("[ReservoirV6_0_1] Mints", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let erc721: Contract;
  let erc1155: Contract;
  let router: Contract;
  let mintModule: Contract;

  beforeEach(async () => {
    [deployer, alice, bob] = await ethers.getSigners();

    ({ erc721, erc1155 } = await setupNFTs(deployer));

    router = await ethers
      .getContractFactory("ReservoirV6_0_1", deployer)
      .then((factory) => factory.deploy());
    mintModule = await ethers
      .getContractFactory("MintModule", deployer)
      .then((factory) => factory.deploy());
  });

  const getBalances = async (token: string) => {
    if (token === Sdk.Common.Addresses.Native[chainId]) {
      return {
        alice: await ethers.provider.getBalance(alice.address),
        bob: await ethers.provider.getBalance(bob.address),
        router: await ethers.provider.getBalance(router.address),
        mintModule: await ethers.provider.getBalance(mintModule.address),
      };
    } else {
      const contract = new Sdk.Common.Helpers.Erc20(ethers.provider, token);
      return {
        alice: await contract.getBalance(alice.address),
        bob: await contract.getBalance(bob.address),
        router: await contract.getBalance(router.address),
        mintModule: await contract.getBalance(mintModule.address),
      };
    }
  };

  afterEach(reset);

  const testMints = async (
    // Whether to test ERC721 or ERC1155 mints
    standard: "erc721" | "erc1155",
    // Whether to revert some mints in order to trigger partial filling
    partial: boolean,
    // Whether to include fees on top
    chargeFees: boolean,
    // Whether to revert or not in case of any failures
    revertIfIncomplete: boolean
  ) => {
    const iface = new Interface([
      `
        function mintMultiple(
          (
            address to,
            bytes data,
            uint256 value,
            (
              address recipient,
              uint256 amount
            )[] fees
          )[] mintDetails,
          (
            address refundTo,
            bool revertIfIncomplete
          ) params
        )
      `,
      "function mint(address minter, bytes data)",
    ]);

    const [tokenId1, amount1, revert1, fees1] = [
      0,
      2,
      partial ? getRandomBoolean() : false,
      chargeFees ? [parseEther(getRandomFloat(0.0001, 0.1).toFixed(6))] : [],
    ];
    const [tokenId2, amount2, revert2, fees2] = [
      1,
      5,
      partial ? getRandomBoolean() : false,
      chargeFees ? [parseEther(getRandomFloat(0.0001, 0.1).toFixed(6))] : [],
    ];

    const totalPrice = fees1
      .reduce((a, b) => a.add(b), bn(0))
      .add(fees2.reduce((a, b) => a.add(b), bn(0)));

    let moduleCalldata: string;
    if (standard === "erc721") {
      moduleCalldata = iface.encodeFunctionData("mintMultiple", [
        [
          {
            to: erc721.address,
            data: revert1
              ? erc721.interface.encodeFunctionData("fail", [])
              : erc721.interface.encodeFunctionData("mint", [tokenId1]),
            value: 0,
            fees: fees1.map((fee) => ({
              recipient: bob.address,
              amount: fee,
            })),
          },
          {
            to: erc721.address,
            data: revert2
              ? erc721.interface.encodeFunctionData("fail", [])
              : erc721.interface.encodeFunctionData("mint", [tokenId2]),
            value: 0,
            fees: fees2.map((fee) => ({
              recipient: bob.address,
              amount: fee,
            })),
          },
        ],
        {
          refundTo: alice.address,
          revertIfIncomplete,
        },
      ]);
    } else {
      moduleCalldata = iface.encodeFunctionData("mintMultiple", [
        [
          {
            to: erc1155.address,
            data: revert1
              ? erc1155.interface.encodeFunctionData("fail", [])
              : erc1155.interface.encodeFunctionData("mintMany", [tokenId1, amount1]),
            value: 0,
            fees: fees1.map((fee) => ({
              recipient: bob.address,
              amount: fee,
            })),
          },
          {
            to: erc1155.address,
            data: revert2
              ? erc1155.interface.encodeFunctionData("fail", [])
              : erc1155.interface.encodeFunctionData("mintMany", [tokenId2, amount2]),
            value: 0,
            fees: fees2.map((fee) => ({
              recipient: bob.address,
              amount: fee,
            })),
          },
        ],
        {
          refundTo: alice.address,
          revertIfIncomplete,
        },
      ]);
    }

    if (partial && revertIfIncomplete && (revert1 || revert2)) {
      await expect(
        router.connect(alice).execute(
          [
            {
              module: mintModule.address,
              data: mintModule.interface.encodeFunctionData("mint", [
                alice.address,
                moduleCalldata,
              ]),
              value: totalPrice,
            },
          ],
          { value: totalPrice }
        )
      ).to.be.revertedWith("reverted with custom error 'UnsuccessfulExecution()'");

      return;
    }

    // Fetch pre-state

    const ethBalancesBefore = await getBalances(Sdk.Common.Addresses.Native[chainId]);

    // Execute

    await router.connect(alice).execute(
      [
        {
          module: mintModule.address,
          data: iface.encodeFunctionData("mint", [alice.address, moduleCalldata]),
          value: totalPrice,
        },
      ],
      { value: totalPrice }
    );

    // Fetch post-state

    const ethBalancesAfter = await getBalances(Sdk.Common.Addresses.Native[chainId]);

    // Alice for the minted NFTs
    if (!revert1) {
      standard === "erc721"
        ? expect(await erc721.ownerOf(tokenId1)).to.eq(alice.address)
        : expect(await erc1155.balanceOf(alice.address, tokenId1)).to.eq(bn(amount1));
    }
    if (!revert2) {
      standard === "erc721"
        ? expect(await erc721.ownerOf(tokenId2)).to.eq(alice.address)
        : expect(await erc1155.balanceOf(alice.address, tokenId2)).to.eq(bn(amount2));
    }

    // Emilio got the fee payments
    if (chargeFees) {
      expect(ethBalancesAfter.bob.sub(ethBalancesBefore.bob)).to.eq(
        bn(revert1 ? 0 : fees1.reduce((a, b) => a.add(b), bn(0))).add(
          revert2 ? 0 : fees2.reduce((a, b) => a.add(b), bn(0))
        )
      );
    }
  };

  for (const standard of ["erc721", "erc1155"]) {
    for (const partial of [false, true]) {
      for (const chargeFees of [false, true]) {
        for (const revertIfIncomplete of [false, true]) {
          it(
            `[${standard}]` +
              `${partial ? "[partial]" : "[full]"}` +
              `${chargeFees ? "[fees]" : "[no-fees]"}` +
              `${revertIfIncomplete ? "[reverts]" : "[skip-reverts]"}`,
            async () =>
              testMints(standard as "erc721" | "erc1155", partial, chargeFees, revertIfIncomplete)
          );
        }
      }
    }
  }
});

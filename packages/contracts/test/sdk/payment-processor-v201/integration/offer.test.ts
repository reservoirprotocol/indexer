/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-console */

import { Contract } from "@ethersproject/contracts";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { ethers } from "hardhat";
import * as indexerHelper from "../../../indexer-helper";
import { getChainId, setupNFTs } from "../../../utils";
import { testCase } from "./shared";

describe("PaymentProcessorV201 - Indexer Offer Integration Test", () => {
    const chainId = getChainId();

    let deployer: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;

    let erc721: Contract;

    beforeEach(async () => {
        // Reset Indexer
        await indexerHelper.reset();

        [deployer, alice, bob] = await ethers.getSigners();
        ({ erc721 } = await setupNFTs(deployer));
    });

    afterEach(async () => {
        // await reset();
    });


    it("Fill Offer via Router API", async () =>
        testCase({
            executeByRouterAPI: true,
            bob,
            alice,
            chainId,
            erc721
        }));

    it("Fill offer", async () => testCase({
        bob,
        alice,
        chainId,
        erc721
    }));
});

import { Contract } from "@ethersproject/contracts";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { ethers } from "hardhat";

describe("Test tokens", () => {
  let deployer: SignerWithAddress;

  let erc721: Contract;
  let erc1155: Contract;

  beforeEach(async () => {
    [deployer] = await ethers.getSigners();

    erc721 = (await ethers
      .getContractFactory("ReservoirErc721", deployer)
      .then((factory) =>
        factory.deploy(
          "https://metadata-production.up.railway.app/api/test/erc721/"
        )
      )) as any;

    erc1155 = (await ethers
      .getContractFactory("ReservoirErc1155", deployer)
      .then((factory) =>
        factory.deploy(
          "https://metadata-production.up.railway.app/api/test/erc1155/"
        )
      )) as any;
  });

  it("Minting", async () => {
    await erc721.connect(deployer).mint(0);
    await erc1155.connect(deployer).mint(0, 10);
  });
});

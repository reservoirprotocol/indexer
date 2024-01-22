/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-console */

import { Contract } from "@ethersproject/contracts";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { ethers } from "hardhat";
import fs from "fs";

export const setupPalette = async (
  deployer: SignerWithAddress,
  erc721Collection?: string,
  erc1155Collection?: string,
) => {
  if (!process.env.PALETTE_FACTORY && process.env.PALETTE_ERC721 && process.env.PALETTE_ERC1155) {
    console.log('skip')
    process.exit(1);
  }
  const FactoryFile = JSON.parse(fs.readFileSync(String(process.env.PALETTE_FACTORY), "utf-8"));
  const ERC721ImplFile = JSON.parse(
    fs.readFileSync(String(process.env.PALETTE_ERC721), "utf-8")
  );
  const ERC1155ImplFile = JSON.parse(
    fs.readFileSync(String(process.env.PALETTE_ERC1155), "utf-8")
  );
  const RoyaltyImplFile = JSON.parse(
    fs.readFileSync(String(process.env.PALETTE_ROYALTY), "utf-8")
  );
  const RefunderImplFile = JSON.parse(
    fs.readFileSync(String(process.env.PALETTE_REFUNDER), "utf-8")
  );

  

  const Orderbook721  = await ethers.getContractFactory(ERC721ImplFile.abi, ERC721ImplFile.bytecode.object, deployer);
  const Orderbook1155 = await ethers.getContractFactory(ERC1155ImplFile.abi, ERC1155ImplFile.bytecode.object, deployer)
  const RoyaltyRegistry = await ethers.getContractFactory(RoyaltyImplFile.abi, RoyaltyImplFile.bytecode.object, deployer)
  const Refunder = await ethers.getContractFactory(RefunderImplFile.abi, RefunderImplFile.bytecode.object, deployer)

  
  const Factory = await ethers.getContractFactory(FactoryFile.abi, FactoryFile.bytecode.object, deployer);
  const erc721Impl = await Orderbook721.deploy();
  const erc1155Impl = await Orderbook1155.deploy();
  const royaltyRegistry = await RoyaltyRegistry.deploy();
  const refunder = await Refunder.deploy();

  const factory = await Factory.deploy(
    royaltyRegistry.address,
    refunder.address
  );

  await factory.update721Impl(erc721Impl.address);
  await factory.update1155Impl(erc1155Impl.address);
  const orderbooks: Contract[] = [];

  if (erc721Collection) {
    const createTx = await factory.createOrderbook721(erc721Collection);
    const createRecepiet = await createTx.wait();
    const createEvent = createRecepiet.events.find((c: any) => {
      return c.event && c.event.includes('Created')
    });
    const orderbook = createEvent.args.orderbook;
    orderbooks.push(Orderbook721.attach(orderbook));
  }

  if (erc1155Collection) {
    const createTx = await factory.createOrderbook1155(erc1155Collection);
    const createRecepiet = await createTx.wait();
    const createEvent = createRecepiet.events.find((c: any) => {
      return c.event && c.event.includes('Created')
    });
    const orderbook = createEvent.args.orderbook;
    orderbooks.push(Orderbook1155.attach(orderbook));
  }

  return {
    factory,
    orderbooks
  }
};

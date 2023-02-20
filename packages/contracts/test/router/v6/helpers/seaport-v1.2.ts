import { BigNumberish } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk/src";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { ethers } from "hardhat";

import { getChainId, getCurrentTimestamp } from "../../../utils";

// --- Listings ---

export type Listing = {
  seller: SignerWithAddress;
  nft: {
    kind: "erc721" | "erc1155";
    contract: Contract;
    id: number;
    // A single quantity if missing
    amount?: number;
  };
  // ETH if missing
  paymentToken?: string;
  price: BigNumberish;
  // Whether the order is to be cancelled
  isCancelled?: boolean;
  order?: Sdk.SeaportV12.Order;
};

export const setupListings = async (listings: Listing[]) => {
  const chainId = getChainId();

  for (const listing of listings) {
    const { seller, nft, paymentToken, price } = listing;

    // Approve the exchange contract
    if (nft.kind === "erc721") {
      await nft.contract.connect(seller).mint(nft.id);
      await nft.contract
        .connect(seller)
        .setApprovalForAll(Sdk.SeaportV12.Addresses.Exchange[chainId], true);
    } else {
      await nft.contract.connect(seller).mintMany(nft.id, nft.amount ?? 1);
      await nft.contract
        .connect(seller)
        .setApprovalForAll(Sdk.SeaportV12.Addresses.Exchange[chainId], true);
    }

    // Build and sign the order
    const builder = new Sdk.SeaportV12.Builders.SingleToken(chainId);
    const order = builder.build({
      side: "sell",
      tokenKind: nft.kind,
      offerer: seller.address,
      contract: nft.contract.address,
      tokenId: nft.id,
      amount: nft.amount ?? 1,
      paymentToken: paymentToken ?? Sdk.Common.Addresses.Eth[chainId],
      price,
      counter: 0,
      startTime: await getCurrentTimestamp(ethers.provider),
      endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
    });
    await order.sign(seller);

    listing.order = order;

    // Cancel the order if requested
    if (listing.isCancelled) {
      const exchange = new Sdk.SeaportV12.Exchange(chainId);
      await exchange.cancelOrder(seller, order);
    }
  }
};

// --- Offers ---

export type Offer = {
  buyer: SignerWithAddress;
  nft: {
    kind: "erc721" | "erc1155";
    contract: Contract;
    id: number;
    // A single quantity if missing
    amount?: number;
  };
  // All offers are in WETH
  price: BigNumberish;
  fees?: {
    recipient: string;
    amount: BigNumberish;
  }[];
  isCancelled?: boolean;
  order?: Sdk.SeaportV12.Order;
};

export const setupOffers = async (offers: Offer[]) => {
  const chainId = getChainId();

  for (const offer of offers) {
    const { buyer, nft, price, fees } = offer;

    const weth = new Sdk.Common.Helpers.Weth(ethers.provider, chainId);
    await weth.deposit(buyer, price);
    await weth.approve(buyer, Sdk.SeaportV12.Addresses.Exchange[chainId]);

    // Build and sign the order
    const builder = new Sdk.SeaportV12.Builders.SingleToken(chainId);
    const order = builder.build({
      side: "buy",
      tokenKind: nft.kind,
      offerer: buyer.address,
      contract: nft.contract.address,
      tokenId: nft.id,
      amount: nft.amount ?? 1,
      paymentToken: weth.contract.address,
      price,
      fees,
      counter: 0,
      startTime: await getCurrentTimestamp(ethers.provider),
      endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
    });
    await order.sign(buyer);

    offer.order = order;

    // Cancel the order if requested
    if (offer.isCancelled) {
      const exchange = new Sdk.SeaportV12.Exchange(chainId);
      await exchange.cancelOrder(buyer, order);
    }
  }
};

// TODO: Integrate approval orders within the SDK

// --- ERC20 Approval ---

export type ERC20Approval = {
  giver: SignerWithAddress;
  filler: string;
  receiver?: string;
  paymentToken: string;
  amount: BigNumberish;
  zone?: string;
  order?: Sdk.SeaportV12.Order;
};

export const setupERC20Approvals = async (approvals: ERC20Approval[]) => {
  const chainId = getChainId();

  for (const approval of approvals) {
    const { giver, receiver, filler, paymentToken, amount, zone } = approval;

    // Approve the exchange contract
    const erc20 = new Sdk.Common.Helpers.Erc20(ethers.provider, paymentToken);
    await erc20.approve(giver, Sdk.SeaportV12.Addresses.Exchange[chainId]);

    // Build and sign the approval order (in a hacky way)
    const builder = new Sdk.SeaportV12.Builders.SingleToken(chainId);
    const order = builder.build({
      side: "sell",
      tokenKind: "erc721",
      offerer: giver.address,
      contract: giver.address,
      tokenId: 0,
      paymentToken: paymentToken,
      price: amount,
      counter: 0,
      startTime: await getCurrentTimestamp(ethers.provider),
      endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
    });

    // Tweak the offer and consideration items
    order.params.offer = [
      {
        itemType: 1,
        token: paymentToken,
        identifierOrCriteria: "0",
        startAmount: amount.toString(),
        endAmount: amount.toString(),
      },
    ];
    order.params.consideration = [
      {
        ...order.params.offer[0],
        recipient: receiver ?? filler,
      },
    ];

    if (zone) {
      order.params.zone = zone;
      // If the zone is specified, the order is restricted
      order.params.orderType += 2;
    }

    // Sign the order
    await order.sign(giver);

    approval.order = order;
  }
};

// --- ERC721 Approval ---

export type ERC721Approval = {
  giver: SignerWithAddress;
  filler: string;
  receiver?: string;
  nft: {
    kind: "erc721" | "erc1155";
    contract: Contract;
    id: number;
    // A single quantity if missing
    amount?: number;
  };
  zone?: string;
  order?: Sdk.SeaportV12.Order;
};

export const setupERC721Approvals = async (
  approvals: ERC721Approval[],
  skipMint?: boolean
) => {
  const chainId = getChainId();

  for (const approval of approvals) {
    const { giver, filler, receiver, nft, zone } = approval;

    // Approve the exchange contract
    if (nft.kind === "erc721") {
      if (!skipMint) {
        await nft.contract.connect(giver).mint(nft.id);
      }
      await nft.contract
        .connect(giver)
        .setApprovalForAll(Sdk.SeaportV12.Addresses.Exchange[chainId], true);
    } else {
      if (!skipMint) {
        await nft.contract.connect(giver).mintMany(nft.id, nft.amount ?? 1);
      }
      await nft.contract
        .connect(giver)
        .setApprovalForAll(Sdk.SeaportV12.Addresses.Exchange[chainId], true);
    }

    // Build and sign the approval order (in a hacky way)
    const builder = new Sdk.SeaportV12.Builders.SingleToken(chainId);
    const order = builder.build({
      side: "sell",
      tokenKind: "erc721",
      offerer: giver.address,
      contract: giver.address,
      tokenId: 0,
      paymentToken: giver.address,
      price: 1,
      counter: 0,
      startTime: await getCurrentTimestamp(ethers.provider),
      endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
    });

    // Tweak the offer and consideration items
    order.params.offer = [
      {
        itemType: nft.kind === "erc721" ? 2 : 3,
        token: nft.contract.address,
        identifierOrCriteria: nft.id.toString(),
        startAmount: nft.amount?.toString() ?? "1",
        endAmount: nft.amount?.toString() ?? "1",
      },
    ];
    order.params.consideration = [
      {
        ...order.params.offer[0],
        recipient: receiver ?? filler,
      },
    ];

    if (zone) {
      order.params.zone = zone;
      // If the zone is specified, the order is restricted
      order.params.orderType += 2;
    }

    // Sign the order
    await order.sign(giver);

    approval.order = order;
  }
};

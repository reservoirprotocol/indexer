import { Interface } from "@ethersproject/abi";
import { Blend } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const loanOfferTaken: EventData = {
  kind: "blend",
  subKind: "blend-loan-offer-taken",
  addresses: { [Blend.Addresses.Blend[config.chainId]?.toLowerCase()]: true },
  topic: "0x06a333c2d6fe967ca967f7a35be2eb45e8caeb6cf05e16f55d42b91b5fe31255",
  numTopics: 1,
  abi: new Interface([
    `event LoanOfferTaken(
      bytes32 offerHash,
      uint256 lienId,
      address collection,
      address lender,
      address borrower,
      uint256 loanAmount,
      uint256 rate,
      uint256 tokenId,
      uint256 auctionDuration
    )`,
  ]),
};

export const repay: EventData = {
  kind: "blend",
  subKind: "blend-repay",
  addresses: { [Blend.Addresses.Blend[config.chainId]?.toLowerCase()]: true },
  topic: "0x2469cc9e12e74c63438d5b1117b318cd3a4cdaf9d659d9eac6d975d14d963254",
  numTopics: 1,
  abi: new Interface([`event Repay(uint256 lienId, address collection)`]),
};

export const refinance: EventData = {
  kind: "blend",
  subKind: "blend-refinance",
  addresses: { [Blend.Addresses.Blend[config.chainId]?.toLowerCase()]: true },
  topic: "0x558a9295c62e9e1b12a21c8fe816f4816a2e0269a53157edbfa16017b11b9ac9",
  numTopics: 1,
  abi: new Interface([
    `event Refinance(
      uint256 lienId,
      address collection,
      address newLender,
      uint256 newAmount,
      uint256 newRate,
      uint256 newAuctionDuration
    )`,
  ]),
};

export const buyLocked: EventData = {
  kind: "blend",
  subKind: "blend-buy-locked",
  addresses: { [Blend.Addresses.Blend[config.chainId]?.toLowerCase()]: true },
  topic: "0x7ffb5bd9cdc79a6f9bc6e00c82f43836e0afbb204d47972001f6e853764a8ef1",
  numTopics: 1,
  abi: new Interface([
    `event BuyLocked(
      uint256 lienId,
      address collection,
      address buyer,
      address seller,
      uint256 tokenId
    )`,
  ]),
};

export const nonceIncremented: EventData = {
  kind: "blend",
  subKind: "blend-nonce-incremented",
  addresses: { [Blend.Addresses.Blend[config.chainId]?.toLowerCase()]: true },
  topic: "0xa82a649bbd060c9099cd7b7326e2b0dc9e9af0836480e0f849dc9eaa79710b3b",
  numTopics: 2,
  abi: new Interface([`event NonceIncremented(address indexed user, uint256 newNonce)`]),
};

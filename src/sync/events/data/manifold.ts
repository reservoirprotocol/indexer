import { Interface } from "@ethersproject/abi";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";
import { Manifold } from "@reservoir0x/sdk";

export const purchase: EventData = {
  kind: "manifold-purchase",
  addresses: { [Manifold.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x0e0d473f43a9d8727e62653cce4cd80d0c870ffb83dc4c93c9db4cb8ffe7053e",
  numTopics: 2,
  abi: new Interface([
    `event PurchaseEvent(uint40 indexed listingId, address referrer, address buyer, uint24 count, uint256 amount)`,
  ]),
};

export const modify: EventData = {
  kind: "manifold-modify",
  addresses: { [Manifold.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xde38900f75163598713718d539a09596c3c1b9bacd1432ea1be04fa658d0cada",
  numTopics: 2,
  abi: new Interface([
    `event ModifyListing(uint40 indexed listingId, uint256 initialAmount, uint48 startTime, uint48 endTime)`,
  ]),
};

export const cancel: EventData = {
  kind: "manifold-cancel",
  addresses: { [Manifold.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x19ef8c897f0ad4be12bac96be8f4a3984059ae9566f02163b0e48cf00f9aa338",
  numTopics: 2,
  abi: new Interface([
    `event CancelListing(uint40 indexed listingId, address requestor, uint16 holdbackBPS)`,
  ]),
};

export const finalize: EventData = {
  kind: "manifold-finalize",
  addresses: { [Manifold.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x7a64269d6d03ead41925c75675255493546f656ebb9cae4158fea2633d86c541",
  numTopics: 2,
  abi: new Interface([`event FinalizeListing(uint40 indexed listingId)`]),
};

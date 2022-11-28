import { Interface } from "@ethersproject/abi";

import { getNetworkSettings } from "@/config/network";
import { EventData } from "@/events-sync/data";

export const transfer: EventData = {
  kind: "erc20-transfer",
  addresses: getNetworkSettings().supportedBidCurrencies,
  topic: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  numTopics: 3,
  abi: new Interface([
    `event Transfer(
      address indexed from,
      address indexed to,
      uint256 amount
    )`,
  ]),
};

export const approval: EventData = {
  kind: "erc20-approval",
  addresses: getNetworkSettings().supportedBidCurrencies,
  topic: "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925",
  numTopics: 3,
  abi: new Interface([
    `event Approval(
      address indexed owner,
      address indexed spender,
      uint256 value
    )`,
  ]),
};

export const deposit: EventData = {
  kind: "weth-deposit",
  addresses: getNetworkSettings().supportedBidCurrencies,
  topic: "0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c",
  numTopics: 2,
  abi: new Interface([
    `event Deposit(
      address indexed to,
      uint256 amount
    )`,
  ]),
};

export const withdrawal: EventData = {
  kind: "weth-withdrawal",
  addresses: getNetworkSettings().supportedBidCurrencies,
  topic: "0x7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65",
  numTopics: 2,
  abi: new Interface([
    `event Withdrawal(
      address indexed from,
      uint256 amount
    )`,
  ]),
};

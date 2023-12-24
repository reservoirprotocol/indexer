import { Interface } from "@ethersproject/abi";
import { BlurV2 } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const execution: EventData = {
  kind: "blur-v2",
  subKind: "blur-v2-execution",
  addresses: { [BlurV2.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xf2f66294df6fae7ac681cbe2f6d91c6904485929679dce263e8f6539b7d5c559",
  numTopics: 1,
  abi: new Interface([
    `event Execution(
      (
        address trader,
        uint256 id,
        uint256 amount,
        address collection,
        uint8 assetType
      ) transfer,
      bytes32 orderHash,
      uint256 listingIndex,
      uint256 price,
      (
        address recipient,
        uint16 rate
      ) makerFee,
      (
        (
          address recipient,
          uint16 rate
        ) protocolFee,
        (
          address recipient,
          uint16 rate
        ) takerFee
      ) fees,
      uint8 orderType
    )`,
  ]),
};

export const execution721Packed: EventData = {
  kind: "blur-v2",
  subKind: "blur-v2-execution-721-packed",
  addresses: { [BlurV2.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x1d5e12b51dee5e4d34434576c3fb99714a85f57b0fd546ada4b0bddd736d12b2",
  numTopics: 1,
  abi: new Interface([
    `event Execution721Packed(
      bytes32 orderHash,
      uint256 tokenIdListingIndexTrader,
      uint256 collectionPriceSide
    )`,
  ]),
};

export const execution721TakerFeePacked: EventData = {
  kind: "blur-v2",
  subKind: "blur-v2-execution-721-taker-fee-packed",
  addresses: { [BlurV2.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x0fcf17fac114131b10f37b183c6a60f905911e52802caeeb3e6ea210398b81ab",
  numTopics: 1,
  abi: new Interface([
    `event Execution721TakerFeePacked(
      bytes32 orderHash,
      uint256 tokenIdListingIndexTrader,
      uint256 collectionPriceSide,
      uint256 takerFeeRecipientRate
    )`,
  ]),
};

export const execution721MakerFeePacked: EventData = {
  kind: "blur-v2",
  subKind: "blur-v2-execution-721-maker-fee-packed",
  addresses: { [BlurV2.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x7dc5c0699ac8dd5250cbe368a2fc3b4a2daadb120ad07f6cccea29f83482686e",
  numTopics: 1,
  abi: new Interface([
    `event Execution721MakerFeePacked(
      bytes32 orderHash,
      uint256 tokenIdListingIndexTrader,
      uint256 collectionPriceSide,
      uint256 makerFeeRecipientRate
    )`,
  ]),
};

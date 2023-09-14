import { Interface } from "@ethersproject/abi";
import { ZeroExV2 } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const fill: EventData = {
  kind: "zeroex-v2",
  subKind: "zeroex-v2-fill",
  addresses: { [ZeroExV2.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x0bcc4c97732e47d9946f229edb95f5b6323f601300e4690de719993f3c371129",
  numTopics: 4,
  abi: new Interface([
    `event Fill(
      address indexed makerAddress, 
      address indexed feeRecipientAddress, 
      address takerAddress, 
      address senderAddress, 
      uint256 makerAssetFilledAmount, 
      uint256 takerAssetFilledAmount, 
      uint256 makerFeePaid, 
      uint256 takerFeePaid, 
      bytes32 indexed orderHash, 
      bytes makerAssetData, 
      bytes takerAssetData
    )`,
  ]),
};

import { Interface } from "@ethersproject/abi";
import { ZeroExV3 } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const fill: EventData = {
  kind: "zeroex-v3",
  subKind: "zeroex-v3-fill",
  addresses: { [ZeroExV3.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x6869791f0a34781b29882982cc39e882768cf2c96995c2a110c577c53bc932d5",
  numTopics: 4,
  abi: new Interface([
    `event Fill(
       address indexed makerAddress,
       address indexed feeRecipientAddress,
       bytes makerAssetData,
       bytes takerAssetData,
       bytes makerFeeAssetData,
       bytes takerFeeAssetData,
       bytes32 indexed orderHash,
       address takerAddress,
       address senderAddress,
       uint256 makerAssetFilledAmount,
       uint256 takerAssetFilledAmount,
       uint256 makerFeePaid,
       uint256 takerFeePaid,
       uint256 protocolFeePaid
    )`,
  ]),
};

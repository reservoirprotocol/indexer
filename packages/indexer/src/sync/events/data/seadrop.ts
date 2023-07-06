import { Interface } from "@ethersproject/abi";
import { Seadrop } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const publicDropUpdated: EventData = {
  kind: "seadrop",
  subKind: "seadrop-public-drop-updated",
  addresses: { [Seadrop.Addresses.Seadrop[config.chainId]?.toLowerCase()]: true },
  topic: "0x3e30d8e1f739ea4795c481b21c23f905e938b80339305f3508e43c558e5dead3",
  numTopics: 2,
  abi: new Interface([
    `event PublicDropUpdated(
      address indexed nftContract,
      (
        uint80 mintPrice,
        uint48 startTime,
        uint48 endTime,
        uint16 maxTotalMintableByWallet,
        uint16 feeBps,
        bool restrictFeeRecipients
      ) publicDrop
    )`,
  ]),
};

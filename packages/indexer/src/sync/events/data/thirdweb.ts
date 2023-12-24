import { Interface } from "@ethersproject/abi";

import { EventData } from "@/events-sync/data";

export const claimConditionsUpdatedERC721: EventData = {
  kind: "thirdweb",
  subKind: "thirdweb-claim-conditions-updated-erc721",
  topic: "0xbf4016fceeaaa4ac5cf4be865b559ff85825ab4ca7aa7b661d16e2f544c03098",
  numTopics: 1,
  abi: new Interface([
    `event ClaimConditionsUpdated(
      (
        uint256 startTimestamp,
        uint256 maxClaimableSupply,
        uint256 supplyClaimed,
        uint256 quantityLimitPerWallet,
        bytes32 merkleRoot,
        uint256 pricePerToken,
        address currency,
        string metadata
      )[] claimConditions,
      bool resetEligibility
    )`,
  ]),
};

export const claimConditionsUpdatedERC1155: EventData = {
  kind: "thirdweb",
  subKind: "thirdweb-claim-conditions-updated-erc1155",
  topic: "0x066f72a648b18490c0bc4ab07d508cdb5d6589fa188c63cfba1e0547f3a6556a",
  numTopics: 2,
  abi: new Interface([
    `event ClaimConditionsUpdated(
      uint256 indexed tokenId,
      (
        uint256 startTimestamp,
        uint256 maxClaimableSupply,
        uint256 supplyClaimed,
        uint256 quantityLimitPerWallet,
        bytes32 merkleRoot,
        uint256 pricePerToken,
        address currency,
        string metadata
      )[] claimConditions,
      bool resetEligibility
    )`,
  ]),
};

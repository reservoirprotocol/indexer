import { Interface } from "@ethersproject/abi";

import { EventData } from "@/events-sync/data";

export const transferSingle: EventData = {
  kind: "erc1155",
  subKind: "erc1155-transfer-single",
  topic: "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62",
  numTopics: 4,
  abi: new Interface([
    `event TransferSingle(
      address indexed operator,
      address indexed from,
      address indexed to,
      uint256 tokenId,
      uint256 amount
    )`,
  ]),
};

export const transferBatch: EventData = {
  kind: "erc1155",
  subKind: "erc1155-transfer-batch",
  topic: "0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb",
  numTopics: 4,
  abi: new Interface([
    `event TransferBatch(
      address indexed operator,
      address indexed from,
      address indexed to,
      uint256[] tokenIds,
      uint256[] amounts
    )`,
  ]),
};

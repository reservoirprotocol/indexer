// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ILooksRareV2 {
  enum QuoteType {
    Bid,
    Ask
  }

  enum CollectionType {
    ERC721,
    ERC1155
  }

  enum MerkleTreeNodePosition {
    Left,
    Right
  }

  struct MakerOrder {
    QuoteType quoteType;
    uint256 globalNonce;
    uint256 subsetNonce;
    uint256 orderNonce;
    uint256 strategyId;
    CollectionType collectionType;
    address collection;
    IERC20 currency;
    address signer;
    uint256 startTime;
    uint256 endTime;
    uint256 price;
    uint256[] itemIds;
    uint256[] amounts;
    bytes additionalParameters;
  }

  struct TakerOrder {
    address recipient;
    bytes additionalParameters;
  }

  struct MerkleTreeNode {
    bytes32 value;
    MerkleTreeNodePosition position;
  }

  struct MerkleTree {
    bytes32 root;
    MerkleTreeNode[] proof;
  }

  function transferManager() external view returns (ITransferManager);

  function executeTakerAsk(
    TakerOrder calldata takerAsk,
    MakerOrder calldata makerBid,
    bytes calldata makerSignature,
    MerkleTree calldata merkleTree,
    address affiliate
  ) external;

  function executeTakerBid(
    TakerOrder calldata takerBid,
    MakerOrder calldata makerAsk,
    bytes calldata makerSignature,
    MerkleTree calldata merkleTree,
    address affiliate
  ) external payable;
}

interface ITransferManager {
  function grantApprovals(address[] calldata operators) external;
}

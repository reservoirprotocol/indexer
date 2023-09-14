// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

import {ICryptoPunksMarket} from "../interfaces/ICryptoPunksMarket.sol";

// Since the CryptoPunks are not ERC721 standard-compliant, you cannot create
// orders for them on modern exchange protocols like Seaport. The workarounds
// include using the wrapped version of CryptoPunks (cumbersome and costly to
// use) or using the native CryptoPunks exchange (it lacks features available
// available when using newer exchange protocols - off-chain orders, bids for
// the whole collection or for a set of attributes). To overcome all of these
// we created a new contract called `PunksProxy` which acts in a similiar way
// to the wrapped version of the CryptoPunks but in a zero-abstraction manner
// with everything abstracted out (eg. no need to wrap or unwrap). It acts as
// a standard ERC721 with the caveat that for any transfer operation there is
// a corresponding CryptoPunks-native approval (basically a private offer for
// a price of zero to the proxy contract).
contract PunksProxy {
  using Address for address;

  // --- Fields ---

  ICryptoPunksMarket public constant EXCHANGE =
    ICryptoPunksMarket(0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB);

  mapping(uint256 => address) private tokenApprovals;
  mapping(address => mapping(address => bool)) private operatorApprovals;

  // --- Errors ---

  error Unauthorized();
  error UnsuccessfulSafeTransfer();

  // --- ERC721 standard events ---

  event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

  event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);

  event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

  // --- ERC721 standard methods ---

  function balanceOf(address owner) external view returns (uint256 balance) {
    balance = EXCHANGE.balanceOf(owner);
  }

  function ownerOf(uint256 tokenId) public view returns (address owner) {
    owner = EXCHANGE.punkIndexToAddress(tokenId);
  }

  function getApproved(uint256 tokenId) public view returns (address approved) {
    approved = tokenApprovals[tokenId];
  }

  function isApprovedForAll(address owner, address operator) public view returns (bool approved) {
    approved = operatorApprovals[owner][operator];
  }

  function approve(address to, uint256 tokenId) external {
    address owner = ownerOf(tokenId);
    if (msg.sender != owner && !isApprovedForAll(owner, msg.sender)) {
      revert Unauthorized();
    }

    tokenApprovals[tokenId] = to;
    emit Approval(owner, to, tokenId);
  }

  function setApprovalForAll(address operator, bool approved) external {
    operatorApprovals[msg.sender][operator] = approved;
    emit ApprovalForAll(msg.sender, operator, approved);
  }

  function safeTransferFrom(
    address from,
    address to,
    uint256 tokenId,
    bytes calldata data
  ) external {
    transfer(from, to, tokenId);
    checkOnERC721Received(from, to, tokenId, data);
  }

  function safeTransferFrom(
    address from,
    address to,
    uint256 tokenId
  ) external {
    transfer(from, to, tokenId);
    checkOnERC721Received(from, to, tokenId, "");
  }

  function transferFrom(
    address from,
    address to,
    uint256 tokenId
  ) external {
    transfer(from, to, tokenId);
  }

  function transfer(
    address from,
    address to,
    uint256 tokenId
  ) internal {
    address owner = ownerOf(tokenId);
    if (from != owner) {
      revert Unauthorized();
    }

    if (
      msg.sender != owner &&
      getApproved(tokenId) != msg.sender &&
      !isApprovedForAll(owner, msg.sender)
    ) {
      revert Unauthorized();
    }

    EXCHANGE.buyPunk(tokenId);
    EXCHANGE.transferPunk(to, tokenId);
    emit Transfer(from, to, tokenId);
  }

  function checkOnERC721Received(
    address from,
    address to,
    uint256 tokenId,
    bytes memory data
  ) private {
    if (to.isContract()) {
      try IERC721Receiver(to).onERC721Received(msg.sender, from, tokenId, data) returns (
        bytes4 result
      ) {
        if (result != IERC721Receiver.onERC721Received.selector) {
          revert UnsuccessfulSafeTransfer();
        }
      } catch {
        revert UnsuccessfulSafeTransfer();
      }
    }
  }
}

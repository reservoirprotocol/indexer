// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract ReservoirErc1155 is ERC1155, Ownable {
  using Strings for uint256;

  // Fields

  address private royaltyRecipient;
  uint256 private royaltyBps;

  string public contractURI;

  // Constructor

  constructor(
    address _owner,
    string memory _uri,
    string memory _contractURI,
    address _royaltyRecipient,
    uint256 _royaltyBps
  ) ERC1155(_uri) {
    contractURI = _contractURI;
    royaltyRecipient = _royaltyRecipient;
    royaltyBps = _royaltyBps;

    _transferOwnership(_owner);
  }

  // Public methods

  function mint(uint256 tokenId, uint256 amount) external {
    _mint(msg.sender, tokenId, amount, "");
  }

  function uri(uint256 tokenId) public view virtual override returns (string memory) {
    return string(abi.encodePacked(super.uri(tokenId), tokenId.toString()));
  }

  // Owner methods

  function updateURI(string memory _uri) external onlyOwner {
    _setURI(_uri);
  }

  function updateContractURI(string memory _contractURI) external onlyOwner {
    contractURI = _contractURI;
  }

  function updateRoyalty(address _royaltyRecipient, uint256 _royaltyBps) external onlyOwner {
    royaltyRecipient = _royaltyRecipient;
    royaltyBps = _royaltyBps;
  }

  // EIP2981

  function royaltyInfo(
    uint256,
    uint256 price
  ) external view returns (address receiver, uint256 amount) {
    receiver = royaltyRecipient;
    amount = (price * royaltyBps) / 10000;
  }

  function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
    return interfaceId == 0x2a55205a || super.supportsInterface(interfaceId);
  }
}

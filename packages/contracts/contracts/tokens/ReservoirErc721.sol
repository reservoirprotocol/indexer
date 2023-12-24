// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract ReservoirErc721 is ERC721, Ownable {
  // Fields

  uint256 private nextTokenId;
  string private baseTokenURI;
  address private royaltyRecipient;
  uint256 private royaltyBps;

  string public contractURI;

  // Constructor

  constructor(
    address _owner,
    string memory _baseTokenURI,
    string memory _contractURI,
    address _royaltyRecipient,
    uint256 _royaltyBps
  ) ERC721("Reservoir", "RSV") {
    baseTokenURI = _baseTokenURI;
    contractURI = _contractURI;
    royaltyRecipient = _royaltyRecipient;
    royaltyBps = _royaltyBps;

    _transferOwnership(_owner);
  }

  // Public methods

  function mint() external {
    _mint(msg.sender, nextTokenId++);
  }

  // Owner methods

  function updateBaseTokenURI(string memory _baseTokenURI) external onlyOwner {
    baseTokenURI = _baseTokenURI;
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

  // Internal methods

  function _baseURI() internal view override returns (string memory) {
    return baseTokenURI;
  }
}

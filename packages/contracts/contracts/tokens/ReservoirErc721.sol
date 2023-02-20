// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract ReservoirErc721 is ERC721, Ownable {
    string private baseTokenURI;

    constructor(string memory _baseTokenURI) ERC721("Reservoir", "RSV") {
        baseTokenURI = _baseTokenURI;
    }

    function mint(uint256 tokenId) external {
        _mint(msg.sender, tokenId);
    }

    function updateBaseTokenURI(string memory _baseTokenURI)
        external
        onlyOwner
    {
        baseTokenURI = _baseTokenURI;
    }

    function _baseURI() internal view override returns (string memory) {
        return baseTokenURI;
    }
}

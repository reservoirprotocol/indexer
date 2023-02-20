// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./libraries/BytesUtils.sol";

contract TokenRangeVerifier {
    using BytesUtils for bytes;

    function verify(uint256 startTokenId, uint256 endTokenId) public pure {
        uint256 tokenId = abi.decode(msg.data.slice(136, 32), (uint256));
        require(
            startTokenId <= tokenId && tokenId <= endTokenId,
            "Invalid token id"
        );
    }
}

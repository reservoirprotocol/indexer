// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./libraries/BytesUtils.sol";

contract TokenListVerifier {
    using BytesUtils for bytes;

    function verifyErc721(bytes memory callData) public pure {
        uint256 tokenId = abi.decode(callData.slice(68, 32), (uint256));

        (bytes32 root, bytes32[] memory proof) = abi.decode(
            callData.drop(100),
            (bytes32, bytes32[])
        );

        require(
            verify(proof, root, keccak256(abi.encodePacked(tokenId))),
            "Invalid merkle proof"
        );
    }

    function verifyErc1155(bytes memory callData) public pure {
        uint256 tokenId = abi.decode(callData.slice(68, 32), (uint256));

        (bytes32 root, bytes32[] memory proof) = abi.decode(
            callData.drop(196),
            (bytes32, bytes32[])
        );

        require(
            verify(proof, root, keccak256(abi.encodePacked(tokenId))),
            "Invalid merkle proof"
        );
    }

    function verify(
        bytes32[] memory proof,
        bytes32 root,
        bytes32 leaf
    ) internal pure returns (bool) {
        bytes32 computedHash = leaf;

        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 proofElement = proof[i];

            // Once we get to an empty proof element, stop
            if (proofElement == bytes32(0)) {
                break;
            }

            if (computedHash <= proofElement) {
                // hash(current computed hash + current element of the proof)
                computedHash = keccak256(
                    abi.encodePacked(computedHash, proofElement)
                );
            } else {
                // hash(current element of the proof + current computed hash)
                computedHash = keccak256(
                    abi.encodePacked(proofElement, computedHash)
                );
            }
        }

        // Check if the computed hash (root) is equal to the provided root
        return computedHash == root;
    }
}

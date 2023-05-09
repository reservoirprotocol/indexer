// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.17;

import {IERC721Receiver} from '@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol';
import {IERC1155Receiver} from '@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol';
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IUniversalRouter is IERC721Receiver, IERC1155Receiver {
    
    struct ExecuteParams {
        bytes commands;
        bytes[] inputs;
        uint256 deadline;
        IERC20 tokenIn;
        IERC20 tokenOut;
        uint256 amountInMaximum;
    }

    /// @notice Executes encoded commands along with provided inputs. Reverts if deadline has expired.
    /// @param commands A set of concatenated commands, each 1 byte in length
    /// @param inputs An array of byte strings containing abi encoded inputs for each command
    /// @param deadline The deadline by which the transaction must be executed
    function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable;
}
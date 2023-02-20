// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {BaseModule} from "./BaseModule.sol";
import {IAllowanceTransfer} from "../../interfaces/IAllowanceTransfer.sol";

contract Permit2Module is BaseModule {
    // --- Fields ---

    IAllowanceTransfer public constant PERMIT2 =
        IAllowanceTransfer(0x000000000022D473030F116dDEE9F6B43aC78BA3);

    // --- Constructor ---

    constructor(address owner) BaseModule(owner) {}

    function permitTransfer(
        address owner, 
        IAllowanceTransfer.PermitBatch calldata permitBatch, 
        IAllowanceTransfer.AllowanceTransferDetails[] calldata transferDetails,
        bytes calldata signature
    ) external nonReentrant {
        PERMIT2.permit(owner, permitBatch, signature);
        PERMIT2.transferFrom(transferDetails);
    }
}

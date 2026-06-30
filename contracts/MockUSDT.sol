// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Test-only USDT for the Nile wUNIT/USDT pool demo. 6 decimals, open mint.
contract MockUSDT is ERC20 {
    constructor() ERC20("Tether USD (Nile Mock)", "USDT") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

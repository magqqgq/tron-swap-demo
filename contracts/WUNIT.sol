// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Pausable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";

contract WUNIT is ERC20, ERC20Pausable, AccessControl {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint8 private constant TOKEN_DECIMALS = 6;

    uint256 public totalMinted;
    uint256 public totalBurned;

    event Minted(address indexed to, uint256 amount, address indexed operator);
    event Burned(address indexed from, uint256 amount, address indexed operator);

    constructor(address admin) ERC20("Wrapped UNIT", "wUNIT") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    function decimals() public pure override returns (uint8) {
        return TOKEN_DECIMALS;
    }

    function mint(address to, uint256 amount) external onlyRole(OPERATOR_ROLE) {
        totalMinted += amount;
        _mint(to, amount);
        emit Minted(to, amount, msg.sender);
    }

    function operatorBurn(address from, uint256 amount) external onlyRole(OPERATOR_ROLE) {
        totalBurned += amount;
        _burn(from, amount);
        emit Burned(from, amount, msg.sender);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function _update(address from, address to, uint256 value) internal override(ERC20, ERC20Pausable) {
        super._update(from, to, value);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20Metadata} from "@openzeppelin/contracts/interfaces/IERC20Metadata.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract UnitUsdcStablePool is ERC20, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20Metadata;

    uint256 private constant N_COINS = 2;
    uint256 private constant MAX_ITERATIONS = 255;
    uint256 private constant MAX_SWAP_FEE_BPS = 100;

    IERC20Metadata public immutable wunit;
    IERC20Metadata public immutable usdc;

    uint256 public amplification;
    uint256 public swapFeeBps;
    uint256[2] public precisionMultipliers;

    event TokenExchange(
        address indexed caller,
        uint8 indexed tokenIn,
        uint256 amountIn,
        uint8 indexed tokenOut,
        uint256 amountOut,
        address receiver
    );
    event LiquidityAdded(address indexed provider, uint256 wunitAmount, uint256 usdcAmount, uint256 lpMinted);
    event LiquidityRemoved(address indexed provider, uint256 wunitAmount, uint256 usdcAmount, uint256 lpBurned);
    event AmplificationUpdated(uint256 previousA, uint256 nextA);
    event SwapFeeUpdated(uint256 previousFeeBps, uint256 nextFeeBps);

    constructor(
        address owner_,
        address wunit_,
        address usdc_,
        uint256 initialA_,
        uint256 initialSwapFeeBps_
    ) ERC20("UNIT/USDC Stable LP", "uUSDC-LP") Ownable(owner_) {
        require(initialA_ > 0, "A=0");
        require(initialSwapFeeBps_ <= MAX_SWAP_FEE_BPS, "fee too high");

        wunit = IERC20Metadata(wunit_);
        usdc = IERC20Metadata(usdc_);
        amplification = initialA_;
        swapFeeBps = initialSwapFeeBps_;
        precisionMultipliers[0] = 10 ** (18 - wunit.decimals());
        precisionMultipliers[1] = 10 ** (18 - usdc.decimals());
    }

    function token(uint8 index) public view returns (IERC20Metadata) {
        if (index == 0) {
            return wunit;
        }
        if (index == 1) {
            return usdc;
        }
        revert("bad token");
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setAmplification(uint256 nextA) external onlyOwner {
        require(nextA > 0, "A=0");
        uint256 previousA = amplification;
        amplification = nextA;
        emit AmplificationUpdated(previousA, nextA);
    }

    function setSwapFeeBps(uint256 nextFeeBps) external onlyOwner {
        require(nextFeeBps <= MAX_SWAP_FEE_BPS, "fee too high");
        uint256 previousFeeBps = swapFeeBps;
        swapFeeBps = nextFeeBps;
        emit SwapFeeUpdated(previousFeeBps, nextFeeBps);
    }

    function getBalances() public view returns (uint256[2] memory balances) {
        balances[0] = wunit.balanceOf(address(this));
        balances[1] = usdc.balanceOf(address(this));
    }

    function quoteSwap(uint8 tokenIn, uint256 amountIn) public view returns (uint256 amountOut) {
        require(amountIn > 0, "amount=0");
        require(tokenIn < 2, "bad token");
        uint8 tokenOut = tokenIn == 0 ? 1 : 0;

        uint256[2] memory balances = getBalances();
        uint256[2] memory xp = _xp(balances);
        uint256 x = xp[tokenIn] + (amountIn * precisionMultipliers[tokenIn]);
        uint256 y = _getY(tokenIn, tokenOut, x, xp);
        uint256 dy = xp[tokenOut] - y - 1;
        amountOut = dy / precisionMultipliers[tokenOut];

        uint256 fee = (amountOut * swapFeeBps) / 10_000;
        amountOut -= fee;
    }

    function addLiquidity(
        uint256[2] calldata amounts,
        uint256 minLpOut,
        address receiver
    ) external whenNotPaused nonReentrant returns (uint256 lpOut) {
        require(receiver != address(0), "receiver=0");
        uint256[2] memory balances = getBalances();
        uint256 supply = totalSupply();
        uint256 d0 = supply == 0 ? 0 : _getD(_xp(balances));

        if (supply == 0) {
            require(amounts[0] > 0 && amounts[1] > 0, "bootstrap both");
        }

        for (uint8 i = 0; i < 2; i++) {
            if (amounts[i] > 0) {
                token(i).safeTransferFrom(msg.sender, address(this), amounts[i]);
            }
        }

        uint256[2] memory newBalances = getBalances();
        uint256 d1 = _getD(_xp(newBalances));
        require(d1 > d0, "no liquidity");

        if (supply == 0) {
            lpOut = d1;
        } else {
            lpOut = (supply * (d1 - d0)) / d0;
        }

        require(lpOut >= minLpOut, "slippage");
        _mint(receiver, lpOut);

        emit LiquidityAdded(msg.sender, amounts[0], amounts[1], lpOut);
    }

    function removeLiquidity(
        uint256 lpAmount,
        uint256[2] calldata minAmounts,
        address receiver
    ) external whenNotPaused nonReentrant returns (uint256[2] memory amountsOut) {
        require(lpAmount > 0, "lp=0");
        require(receiver != address(0), "receiver=0");

        uint256 supply = totalSupply();
        require(supply > 0, "supply=0");

        uint256[2] memory balances = getBalances();
        _burn(msg.sender, lpAmount);

        for (uint8 i = 0; i < 2; i++) {
            amountsOut[i] = (balances[i] * lpAmount) / supply;
            require(amountsOut[i] >= minAmounts[i], "min amount");
            token(i).safeTransfer(receiver, amountsOut[i]);
        }

        emit LiquidityRemoved(msg.sender, amountsOut[0], amountsOut[1], lpAmount);
    }

    function swap(
        uint8 tokenIn,
        uint256 amountIn,
        uint256 minAmountOut,
        address receiver
    ) external whenNotPaused nonReentrant returns (uint256 amountOut) {
        require(receiver != address(0), "receiver=0");
        require(amountIn > 0, "amount=0");
        require(tokenIn < 2, "bad token");

        uint8 tokenOut = tokenIn == 0 ? 1 : 0;
        IERC20Metadata inToken = token(tokenIn);
        IERC20Metadata outToken = token(tokenOut);

        uint256[2] memory balances = getBalances();
        inToken.safeTransferFrom(msg.sender, address(this), amountIn);
        uint256 actualAmountIn = inToken.balanceOf(address(this)) - balances[tokenIn];

        uint256[2] memory xp = _xp(balances);
        uint256 x = xp[tokenIn] + (actualAmountIn * precisionMultipliers[tokenIn]);
        uint256 y = _getY(tokenIn, tokenOut, x, xp);
        uint256 dy = xp[tokenOut] - y - 1;
        amountOut = dy / precisionMultipliers[tokenOut];

        uint256 fee = (amountOut * swapFeeBps) / 10_000;
        amountOut -= fee;

        require(amountOut >= minAmountOut, "slippage");
        outToken.safeTransfer(receiver, amountOut);

        emit TokenExchange(msg.sender, tokenIn, actualAmountIn, tokenOut, amountOut, receiver);
    }

    function getPoolState()
        external
        view
        returns (
            uint256 reserveWunit,
            uint256 reserveUsdc,
            uint256 amplification_,
            uint256 swapFeeBps_,
            uint256 totalLpSupply,
            bool paused_
        )
    {
        uint256[2] memory balances = getBalances();
        reserveWunit = balances[0];
        reserveUsdc = balances[1];
        amplification_ = amplification;
        swapFeeBps_ = swapFeeBps;
        totalLpSupply = totalSupply();
        paused_ = paused();
    }

    function _xp(uint256[2] memory balances) internal view returns (uint256[2] memory xp) {
        xp[0] = balances[0] * precisionMultipliers[0];
        xp[1] = balances[1] * precisionMultipliers[1];
    }

    function _getD(uint256[2] memory xp) internal view returns (uint256 d) {
        uint256 sum = xp[0] + xp[1];
        if (sum == 0) {
            return 0;
        }

        d = sum;
        uint256 ann = amplification * N_COINS;

        for (uint256 i = 0; i < MAX_ITERATIONS; i++) {
            uint256 dP = d;
            dP = (dP * d) / (xp[0] * N_COINS);
            dP = (dP * d) / (xp[1] * N_COINS);

            uint256 previousD = d;
            d = ((ann * sum + dP * N_COINS) * d) / (((ann - 1) * d) + ((N_COINS + 1) * dP));

            if (_withinOne(previousD, d)) {
                return d;
            }
        }

        revert("D no converge");
    }

    function _getY(
        uint256 tokenIn,
        uint256 tokenOut,
        uint256 x,
        uint256[2] memory xp
    ) internal view returns (uint256 y) {
        require(tokenIn != tokenOut, "same token");

        uint256 d = _getD(xp);
        uint256 ann = amplification * N_COINS;
        uint256 c = d;
        uint256 sum;

        for (uint256 i = 0; i < N_COINS; i++) {
            uint256 currentX;
            if (i == tokenIn) {
                currentX = x;
            } else if (i == tokenOut) {
                continue;
            } else {
                currentX = xp[i];
            }

            sum += currentX;
            c = (c * d) / (currentX * N_COINS);
        }

        c = (c * d) / (ann * N_COINS);
        uint256 b = sum + (d / ann);
        y = d;

        for (uint256 i = 0; i < MAX_ITERATIONS; i++) {
            uint256 previousY = y;
            y = ((y * y) + c) / ((2 * y) + b - d);
            if (_withinOne(previousY, y)) {
                return y;
            }
        }

        revert("Y no converge");
    }

    function _withinOne(uint256 a, uint256 b) internal pure returns (bool) {
        if (a > b) {
            return a - b <= 1;
        }
        return b - a <= 1;
    }
}

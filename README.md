# Ducat × Tron — wUNIT / USDT swap (testnet demo)

A testnet proof-of-concept: Ducat's **UNIT** wrapped as a TRC-20 (**wUNIT**) on Tron, swappable to **USDT** through a Curve-style StableSwap pool, with a Ducat-branded swap UI.

**Live demo:** https://swap-demo-chi.vercel.app
(Tron **Nile testnet**. Connect TronLink set to Nile to do a real swap.)

> **Status: testnet only. No mainnet, no real value, not audited.** This is a proof-of-concept to show Tron a working wUNIT/USDT swap, not production code.

---

## What's in here

```
swap-demo/     The swap UI — static HTML/CSS/JS, no build step.
contracts/     The Solidity contracts (Tron, Solidity 0.8.24, OpenZeppelin v5).
scripts/       TronBox/TronWeb deploy + compile scripts (reference).
deployments/   Deployed contract addresses on Tron Nile.
```

### Contracts
- `WUNIT.sol` — wrapped UNIT TRC-20 (ERC20 + ERC20Pausable + AccessControl). Taken unchanged from Ducat's `usdc-bridge`, recompiled for Tron's VM.
- `UnitUsdcStablePool.sol` — the Curve-style StableSwap pool, also from `usdc-bridge`.
- `DucatStableSwap.sol` — a **demo variant** of the pool that supports non-standard tokens like real USDT. Real USDT (and the Nile test USDT) does not return a clean `true` from `transfer()`, which OpenZeppelin's SafeERC20 (correctly) rejects. This variant verifies outbound transfers by checking the balance actually moved instead of trusting the return value — the same pattern Curve/Uniswap use to support USDT. **This is a demo build, not the audited production pool.**
- `MockUSDT.sol` — a simple test USDT used during development.

---

## Deployed on Tron Nile (testnet)

| Contract | Address |
|---|---|
| wUNIT (verified) | `TXBd6ceqs6Zm8n7ef1RBuZuVEyWtgrxxqB` |
| Swap pool (USDT-compatible, live demo) | `TBVs8gzjVdgJEeWDshixiMFwtpPNeDvLZu` |
| USDT (real Nile test USDT) | `TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf` |

- wUNIT on Tronscan: https://nile.tronscan.org/#/contract/TXBd6ceqs6Zm8n7ef1RBuZuVEyWtgrxxqB/code
- Example swap tx (25 wUNIT → 24.98 USDT via the UI): https://nile.tronscan.org/#/transaction/97517172d251b8abf6db684947ccc26821d702a4e078a89ee33f167cc18789b0

---

## Run the demo locally

The UI is a single self-contained page; no install needed.

```bash
node swap-demo/serve.mjs
# then open the printed URL (http://localhost:5180)
```

Connect TronLink (set the network to **Nile testnet**, with an account holding wUNIT and a little TRX), enter an amount, and Swap. The page reads live pool reserves, quotes the trade with the real StableSwap math, runs a real `approve` + `swap` on-chain, and shows staged progress until the swap confirms.

The `scripts/` are the TronBox/TronWeb deploy scripts used to build the contracts above; they need `npm install` plus a funded Nile deployer key in `.env` (see `.env.example`). `compile.js` and `deploy.js` (wUNIT) run as-is from the repo root. `deploy-stack.js`, `deploy-ducat-pool.js`, and `tronbox.js` are **reference snapshots** of how the pools were deployed: they expect TronBox build artifacts under `build/tron/` (including `UnitBridgeRouter`, whose source lives in Ducat's `usdc-bridge` repo, not here), so they document the process rather than reproduce it verbatim.

---

## How it works

1. **wUNIT** is a TRC-20 representation of Ducat's UNIT (wrapping UNIT is fine; only BTC is never wrapped/bridged).
2. The **StableSwap pool** holds wUNIT and USDT and prices swaps on a Curve-style invariant (amplification A=200, 0.04% fee), so trades near the 1:1 peg have minimal price impact.
3. The **UI** quotes and executes swaps directly against the pool via TronLink, and visualises price impact across pool depth.

---

## Honest caveats (for review)

- **Testnet only** (Tron Nile). No mainnet, no real value.
- **Shallow liquidity** (~500 USDT in the live pool) — keep demo swaps small. The pool deepens as more test USDT is added.
- **`DucatStableSwap` is a demo variant** of the audited pool (added USDT-compatible transfer handling). It has not been audited.
- The swap UI is a **standalone demo**, not integrated into the Ducat app/wallet.
- A few prices/labels (e.g. token list beyond wUNIT/USDT) are illustrative; only wUNIT ⇄ USDT is wired to live contracts.

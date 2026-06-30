// Stage 2: deploy MockUSDT + wUNIT/USDT StableSwap pool + BridgeRouter on Nile,
// reusing the already-deployed wUNIT. Seed the pool and run a live wUNIT->USDT swap.
const fs = require('node:fs');
const path = require('node:path');
const { TronWeb } = require('tronweb');

const ROOT = __dirname;
const ONE = 10n ** 6n;
const USDT_MINT = 1_000_000n * ONE;
const SEED_WUNIT = 500_000n * ONE;
const SEED_USDT = 500_000n * ONE;
const SWAP_IN = 10_000n * ONE;
const A = 200;
const FEE_BPS = 4;

const load = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const bc = (a) => String(a.bytecode).replace(/^0x/, '');

function env() {
  const e = {};
  for (const l of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const i = l.indexOf('='); if (i > 0) e[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  }
  return e;
}

(async () => {
  const e = env();
  const prior = load('deployments/nile.json');
  const wunitAddr = prior.wunit.base58;
  const tw = new TronWeb({ fullHost: e.NILE_FULLHOST, privateKey: e.DEPLOYER_PRIVATE_KEY });
  const me = tw.defaultAddress.base58;
  console.log('Deployer:', me, '| reusing wUNIT:', wunitAddr);

  const usdtArt = load('build/tron/MockUSDT.json');
  const poolArt = load('build/tron/UnitUsdcStablePool.json');
  const routerArt = load('build/tron/UnitBridgeRouter.json');
  const wunitArt = load('build/tron/WUNIT.json');

  console.log('Deploying MockUSDT...');
  const usdtC = await tw.contract().new({ abi: usdtArt.abi, bytecode: bc(usdtArt), feeLimit: 3_000_000_000, parameters: [] });
  const usdt = tw.address.fromHex(usdtC.address);
  console.log('  USDT:', usdt);

  console.log('Deploying UnitUsdcStablePool...');
  const poolC = await tw.contract().new({ abi: poolArt.abi, bytecode: bc(poolArt), feeLimit: 5_000_000_000, parameters: [me, wunitAddr, usdt, A, FEE_BPS] });
  const pool = tw.address.fromHex(poolC.address);
  console.log('  Pool:', pool);

  console.log('Deploying UnitBridgeRouter...');
  const routerC = await tw.contract().new({ abi: routerArt.abi, bytecode: bc(routerArt), feeLimit: 5_000_000_000, parameters: [me, wunitAddr, usdt, pool] });
  const router = tw.address.fromHex(routerC.address);
  console.log('  Router:', router);

  const wunit = await tw.contract(wunitArt.abi, wunitAddr);
  const usdtToken = await tw.contract(usdtArt.abi, usdt);
  const poolK = await tw.contract(poolArt.abi, pool);

  console.log('Granting wUNIT OPERATOR_ROLE to router...');
  const opRole = await wunit.OPERATOR_ROLE().call();
  await wunit.grantRole(opRole, router).send({ feeLimit: 200_000_000 });

  console.log('Minting USDT to deployer...');
  await usdtToken.mint(me, USDT_MINT.toString()).send({ feeLimit: 200_000_000 });

  console.log('Seeding pool (approve + addLiquidity)...');
  await wunit.approve(pool, SEED_WUNIT.toString()).send({ feeLimit: 200_000_000 });
  await usdtToken.approve(pool, SEED_USDT.toString()).send({ feeLimit: 200_000_000 });
  await poolK.addLiquidity([SEED_WUNIT.toString(), SEED_USDT.toString()], '0', me).send({ feeLimit: 1_000_000_000 });

  console.log('Live swap: 10,000 wUNIT -> USDT...');
  const quote = await poolK.quoteSwap(0, SWAP_IN.toString()).call();
  const quoteOut = BigInt(quote.toString());
  const minOut = (quoteOut * 99n) / 100n;
  await wunit.approve(pool, SWAP_IN.toString()).send({ feeLimit: 200_000_000 });
  const usdtBefore = BigInt((await usdtToken.balanceOf(me).call()).toString());
  const swapTx = await poolK.swap(0, SWAP_IN.toString(), minOut.toString(), me).send({ feeLimit: 1_000_000_000 });
  await new Promise((r) => setTimeout(r, 6000));
  const usdtAfter = BigInt((await usdtToken.balanceOf(me).call()).toString());
  const received = usdtAfter - usdtBefore;

  const balances = await poolK.getBalances().call();
  const out = {
    network: 'nile',
    wunit: wunitAddr,
    usdt, pool, router,
    amplification: A, swapFeeBps: FEE_BPS,
    poolReserves: { wunit: (BigInt(balances[0].toString()) / ONE).toString(), usdt: (BigInt(balances[1].toString()) / ONE).toString() },
    demoSwap: { in: '10000 wUNIT', quotedOut: (quoteOut / ONE).toString() + '.' + (quoteOut % ONE).toString().padStart(6, '0'), received: received.toString(), tx: swapTx },
    explorer: {
      pool: `https://nile.tronscan.org/#/contract/${pool}`,
      usdt: `https://nile.tronscan.org/#/token20/${usdt}`,
      router: `https://nile.tronscan.org/#/contract/${router}`,
      swapTx: `https://nile.tronscan.org/#/transaction/${swapTx}`,
    },
  };
  fs.writeFileSync(path.join(ROOT, 'deployments', 'nile-stack.json'), JSON.stringify(out, null, 2));
  console.log('\n=== DONE ===');
  console.log(`Swapped 10,000 wUNIT -> ${Number(received) / 1e6} USDT (quote ${Number(quoteOut) / 1e6})`);
  console.log(`Pool reserves: ${out.poolReserves.wunit} wUNIT / ${out.poolReserves.usdt} USDT`);
  console.log(JSON.stringify(out.explorer, null, 2));
})().catch((e) => { console.error(e.message || e); process.exit(1); });

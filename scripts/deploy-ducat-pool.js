// Deploy the USDT-compatible DucatStableSwap pool paired with the real Nile USDT,
// seed it, and test a swap to confirm the real USDT pays out.
const fs = require('node:fs');
const path = require('node:path');
const { TronWeb } = require('tronweb');

const ROOT = path.join(__dirname, '..');
const ONE = 10n ** 6n;
const WUNIT = 'TXBd6ceqs6Zm8n7ef1RBuZuVEyWtgrxxqB';
const USDT = 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf';
const SEED = 500n * ONE;
const A = 200, FEE = 4;

const load = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const bc = (a) => String(a.bytecode).replace(/^0x/, '');
const big = (v) => { let s = Array.isArray(v) ? v[0] : v; s = s && s.toString ? s.toString() : String(s); if (s.includes(',')) s = s.split(',')[0]; return BigInt(s); };
const reserves = (res) => { let v = res; if (Array.isArray(v) && v.length === 1 && (Array.isArray(v[0]) || (v[0] && v[0].length === 2))) v = v[0]; return [big(v[0]), big(v[1])]; };
function env() { const e = {}; for (const l of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { const i = l.indexOf('='); if (i > 0) e[l.slice(0, i).trim()] = l.slice(i + 1).trim(); } return e; }
const ERC20 = [{ constant: false, inputs: [{ name: 's', type: 'address' }, { name: 'a', type: 'uint256' }], name: 'approve', outputs: [{ name: '', type: 'bool' }], stateMutability: 'nonpayable', type: 'function' }, { constant: true, inputs: [{ name: 'o', type: 'address' }], name: 'balanceOf', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' }];

(async () => {
  const e = env();
  const tw = new TronWeb({ fullHost: e.NILE_FULLHOST, privateKey: e.DEPLOYER_PRIVATE_KEY });
  const me = tw.defaultAddress.base58;
  async function confirm(txid, label) {
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const info = await tw.trx.getTransactionInfo(txid);
      if (info && info.id) { const res = info.receipt?.result ?? 'SUCCESS'; console.log(`  ${label}: ${res}`); if (res !== 'SUCCESS') throw new Error(`${label} failed: ${res}`); return; }
    }
    throw new Error(`${label} not confirmed`);
  }

  const art = load('build/tron/DucatStableSwap.json');
  console.log('Deploying DucatStableSwap (USDT-compatible)...');
  const c = await tw.contract().new({ abi: art.abi, bytecode: bc(art), feeLimit: 5_000_000_000, parameters: [me, WUNIT, USDT, A, FEE] });
  const pool = tw.address.fromHex(c.address);
  console.log('  Pool:', pool);

  const wunit = await tw.contract(ERC20, WUNIT);
  const usdt = await tw.contract(ERC20, USDT);
  const poolK = await tw.contract(art.abi, pool);

  console.log('Seeding 500 wUNIT / 500 USDT...');
  await confirm(await wunit.approve(pool, SEED.toString()).send({ feeLimit: 200_000_000 }), 'approve wUNIT');
  await confirm(await usdt.approve(pool, SEED.toString()).send({ feeLimit: 200_000_000 }), 'approve USDT');
  await confirm(await poolK.addLiquidity([SEED.toString(), SEED.toString()], '0', me).send({ feeLimit: 1_000_000_000 }), 'addLiquidity');
  const [rW, rU] = reserves(await poolK.getBalances().call());
  console.log('  reserves:', Number(rW) / 1e6, 'wUNIT /', Number(rU) / 1e6, 'USDT');

  console.log('TEST swap: 10 wUNIT -> real USDT...');
  const before = big(await usdt.balanceOf(me).call());
  await confirm(await wunit.approve(pool, (10n * ONE).toString()).send({ feeLimit: 200_000_000 }), 'approve');
  await confirm(await poolK.swap(0, (10n * ONE).toString(), '1', me).send({ feeLimit: 1_000_000_000 }), 'swap');
  const after = big(await usdt.balanceOf(me).call());
  console.log('  received', Number(after - before) / 1e6, 'real USDT  <-- if > 0, the fix works');

  fs.writeFileSync(path.join(ROOT, 'deployments', 'ducat-pool.json'), JSON.stringify({ network: 'nile', wunit: WUNIT, usdt: USDT, pool, amplification: A, swapFeeBps: FEE }, null, 2));
  console.log('\nPOOL:', pool);
})().catch((e) => { console.error('ERROR:', e.message || e); process.exit(1); });

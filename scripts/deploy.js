// Deploy WUNIT to Tron Nile, mint a demo supply, transfer to a throwaway
// second address, and record everything to deployments/nile.json.
const fs = require('node:fs');
const path = require('node:path');
const { TronWeb } = require('tronweb');

const ROOT = path.join(__dirname, '..');
const DEC = 6n;
const ONE = 10n ** DEC;
const MINT_WUNIT = 1_000_000n * ONE;      // 1,000,000 wUNIT
const TRANSFER_WUNIT = 250_000n * ONE;    // 250,000 wUNIT to the 2nd address

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return env;
}

(async () => {
  const env = loadEnv();
  const artifactPath = process.argv[2] || path.join(ROOT, 'build', 'WUNIT.json');
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  artifact.bytecode = String(artifact.bytecode).replace(/^0x/, '');
  console.log(`Using artifact: ${path.relative(ROOT, artifactPath)}`);
  const tronWeb = new TronWeb({ fullHost: env.NILE_FULLHOST, privateKey: env.DEPLOYER_PRIVATE_KEY });
  const deployer = tronWeb.defaultAddress.base58;

  const balanceSun = await tronWeb.trx.getBalance(deployer);
  console.log(`Deployer ${deployer} balance: ${balanceSun / 1e6} TRX`);
  if (balanceSun <= 0) {
    console.error('Deployer has 0 TRX. Fund it from the Nile faucet before deploying.');
    process.exit(1);
  }

  console.log('Deploying WUNIT...');
  const contract = await tronWeb.contract().new({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    feeLimit: 5_000_000_000,
    callValue: 0,
    parameters: [deployer],
  });
  const contractHex = contract.address;
  const contractBase58 = tronWeb.address.fromHex(contractHex);
  console.log(`Deployed wUNIT at ${contractBase58}`);

  const wunit = await tronWeb.contract(artifact.abi, contractBase58);

  console.log(`Minting ${MINT_WUNIT / ONE} wUNIT to deployer...`);
  const mintTx = await wunit.mint(deployer, MINT_WUNIT.toString()).send({ feeLimit: 300_000_000 });

  const second = await tronWeb.createAccount();
  console.log(`Transferring ${TRANSFER_WUNIT / ONE} wUNIT to second address ${second.address.base58}...`);
  const xferTx = await wunit.transfer(second.address.base58, TRANSFER_WUNIT.toString()).send({ feeLimit: 300_000_000 });

  const out = {
    network: 'nile',
    fullHost: env.NILE_FULLHOST,
    deployer,
    wunit: { base58: contractBase58, hex: contractHex },
    name: 'Wrapped UNIT',
    symbol: 'wUNIT',
    decimals: 6,
    demoMint: { to: deployer, amount: MINT_WUNIT.toString(), tx: mintTx },
    demoTransfer: { to: second.address.base58, amount: TRANSFER_WUNIT.toString(), tx: xferTx },
    secondAddress: second.address.base58,
    explorer: {
      contract: `https://nile.tronscan.org/#/contract/${contractBase58}`,
      token: `https://nile.tronscan.org/#/token20/${contractBase58}`,
      mintTx: `https://nile.tronscan.org/#/transaction/${mintTx}`,
      transferTx: `https://nile.tronscan.org/#/transaction/${xferTx}`,
    },
  };
  fs.mkdirSync(path.join(ROOT, 'deployments'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'deployments', 'nile.json'), JSON.stringify(out, null, 2));

  console.log('\n=== DONE ===');
  console.log(JSON.stringify(out.explorer, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });

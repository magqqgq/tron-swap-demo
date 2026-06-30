// Compile WUNIT.sol with solc 0.8.24 targeting evmVersion "paris" so the
// bytecode contains no PUSH0 opcode (Tron TVM rejects PUSH0). Resolves
// OpenZeppelin imports from node_modules. Outputs build/WUNIT.json.
const fs = require('node:fs');
const path = require('node:path');
const solc = require('solc');

const ROOT = __dirname;
const SOURCE = path.join(ROOT, 'contracts', 'WUNIT.sol');

function findImport(importPath) {
  try {
    const resolved = require.resolve(importPath, { paths: [ROOT] });
    return { contents: fs.readFileSync(resolved, 'utf8') };
  } catch (err) {
    return { error: `Cannot find import ${importPath}: ${err.message}` };
  }
}

const input = {
  language: 'Solidity',
  sources: { 'WUNIT.sol': { content: fs.readFileSync(SOURCE, 'utf8') } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: 'paris',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
  },
};

const out = JSON.parse(solc.compile(JSON.stringify(input), { import: findImport }));

const errors = (out.errors || []).filter((e) => e.severity === 'error');
if (errors.length) {
  for (const e of errors) console.error(e.formattedMessage);
  process.exit(1);
}
for (const w of out.errors || []) console.warn(w.formattedMessage);

const artifact = out.contracts['WUNIT.sol'].WUNIT;
const bytecode = artifact.evm.bytecode.object;

fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
fs.writeFileSync(
  path.join(ROOT, 'build', 'WUNIT.json'),
  JSON.stringify({ contractName: 'WUNIT', abi: artifact.abi, bytecode }, null, 2),
);

console.log(`solc version: ${solc.version()}`);
console.log(`evmVersion: paris, optimizer runs: 200`);
console.log(`bytecode length: ${bytecode.length / 2} bytes`);
console.log('Wrote build/WUNIT.json');

// Compile the flattened WUNIT with Tron's solc fork (tron_v0.8.24) so the
// on-chain bytecode matches exactly what Tronscan's verifier produces.
// Compiles only the flattened file to keep single-file source parity with the
// Tronscan verification upload (full match, including metadata).
module.exports = {
  contracts_directory: './contracts-pool-v2',
  contracts_build_directory: './build/tron',
  networks: {
    nile: {
      privateKey: process.env.DEPLOYER_PRIVATE_KEY,
      userFeePercentage: 100,
      feeLimit: 5_000_000_000,
      fullHost: 'https://nile.trongrid.io',
      network_id: '3',
    },
  },
  compilers: {
    solc: {
      version: '0.8.24',
      settings: {
        optimizer: { enabled: true, runs: 200 },
        evmVersion: 'paris',
        viaIR: true,
      },
    },
  },
};

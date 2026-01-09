/**
 * Contract Compilation and Verification Script
 * 
 * This script compiles and validates the Star World Order smart contracts
 * using solc-js. Run with: node scripts/compile-contracts.js
 */

const solc = require('solc');
const fs = require('fs');
const path = require('path');

// Configuration
const CONTRACTS_DIR = path.join(__dirname, '..', 'contracts');
const OUTPUT_DIR = path.join(__dirname, '..', 'artifacts');
const NODE_MODULES_DIR = path.join(__dirname, '..', 'node_modules');

// Contract files to compile
// Note: Only StarForgeV5 is production-ready, other versions are archived
const CONTRACTS = [
  'StarSkrumpeyMarketplace.sol',
  'StarSkrumpeyStaking.sol',
  'StarWorldOrderGovernor.sol',
  'StarForgeV5.sol'
];

/**
 * Import resolver for solc
 */
function findImports(importPath) {
  try {
    let fullPath;
    if (importPath.startsWith('@openzeppelin/')) {
      fullPath = path.join(NODE_MODULES_DIR, importPath);
    } else {
      fullPath = path.join(CONTRACTS_DIR, importPath);
    }
    return { contents: fs.readFileSync(fullPath, 'utf8') };
  } catch (e) {
    return { error: `File not found: ${importPath}` };
  }
}

/**
 * Compile a single contract
 */
function compileContract(contractName) {
  const sourcePath = path.join(CONTRACTS_DIR, contractName);
  const source = fs.readFileSync(sourcePath, 'utf8');
  
  const input = {
    language: 'Solidity',
    sources: {
      [contractName]: { content: source }
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        '*': { 
          '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode', 'metadata'] 
        }
      }
    }
  };

  console.log(`\nCompiling ${contractName}...`);
  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
  
  // Check for errors
  let hasError = false;
  if (output.errors) {
    output.errors.forEach(err => {
      if (err.severity === 'error') {
        console.log(`  ❌ ERROR: ${err.formattedMessage}`);
        hasError = true;
      } else {
        console.log(`  ⚠️  WARNING: ${err.formattedMessage}`);
      }
    });
  }
  
  if (hasError) {
    return null;
  }
  
  // Extract compiled contract data
  if (output.contracts && output.contracts[contractName]) {
    const contracts = output.contracts[contractName];
    const results = {};
    
    Object.keys(contracts).forEach(contractKey => {
      const contract = contracts[contractKey];
      const bytecode = contract.evm?.bytecode?.object;
      const abi = contract.abi;
      
      if (bytecode && abi) {
        const bytecodeSize = bytecode.length / 2;
        console.log(`  ✅ ${contractKey}: ${bytecodeSize} bytes`);
        
        results[contractKey] = {
          abi,
          bytecode: `0x${bytecode}`,
          deployedBytecode: `0x${contract.evm?.deployedBytecode?.object || ''}`,
        };
      }
    });
    
    return results;
  }
  
  return null;
}

/**
 * Save compiled artifacts
 */
function saveArtifacts(contractName, compiledData) {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  Object.keys(compiledData).forEach(contractKey => {
    const artifactPath = path.join(OUTPUT_DIR, `${contractKey}.json`);
    fs.writeFileSync(artifactPath, JSON.stringify(compiledData[contractKey], null, 2));
    console.log(`  📁 Saved: artifacts/${contractKey}.json`);
  });
}

/**
 * Main compilation function
 */
function main() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║       Star World Order - Contract Compilation                  ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  
  let allSuccess = true;
  const compiledContracts = {};
  
  CONTRACTS.forEach(contractName => {
    const result = compileContract(contractName);
    if (result) {
      Object.assign(compiledContracts, result);
      saveArtifacts(contractName, result);
    } else {
      allSuccess = false;
    }
  });
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  
  if (allSuccess) {
    console.log('✅ All contracts compiled successfully!');
    console.log(`\nCompiled contracts:`);
    Object.keys(compiledContracts).forEach(name => {
      console.log(`  - ${name}`);
    });
    console.log(`\nArtifacts saved to: ${OUTPUT_DIR}`);
    process.exit(0);
  } else {
    console.log('❌ Some contracts failed to compile');
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { compileContract, findImports };

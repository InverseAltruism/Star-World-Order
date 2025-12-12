/**
 * Monad Testnet Connection Test Script
 * 
 * This script verifies connection to the Monad testnet
 * Run with: node scripts/test-connection.js
 */

const { ethers } = require('ethers');

// Network configuration
const NETWORKS = {
  mainnet: {
    name: 'Monad Mainnet',
    chainId: 143,
    rpcUrl: 'https://rpc.monad.xyz',
    explorer: 'https://monadscan.com'
  },
  testnet: {
    name: 'Monad Testnet',
    chainId: 10143,
    rpcUrl: 'https://testnet-rpc.monad.xyz',
    explorer: 'https://testnet.monadscan.com',
    faucet: 'https://faucet.monad.xyz'
  }
};

// Skrumpeys NFT contract on mainnet
const SKRUMPEYS_CONTRACT = '0xb0dad798c80e40dd6b8e8545074c6a5b7b97d2c0';

// Simple ERC721 ABI for testing
const ERC721_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)'
];

/**
 * Test connection to a network
 */
async function testConnection(network) {
  console.log(`\n📡 Testing connection to ${network.name}...`);
  console.log(`   RPC URL: ${network.rpcUrl}`);
  console.log(`   Chain ID: ${network.chainId}`);
  
  try {
    const provider = new ethers.JsonRpcProvider(network.rpcUrl);
    
    // Get network info
    const networkInfo = await provider.getNetwork();
    console.log(`   ✅ Connected! Chain ID: ${networkInfo.chainId}`);
    
    // Get latest block
    const blockNumber = await provider.getBlockNumber();
    console.log(`   📦 Latest block: ${blockNumber}`);
    
    // Get block details
    const block = await provider.getBlock(blockNumber);
    console.log(`   ⏰ Block time: ${new Date(Number(block.timestamp) * 1000).toISOString()}`);
    console.log(`   ⛽ Gas used: ${block.gasUsed.toString()}`);
    
    // Get gas price
    const feeData = await provider.getFeeData();
    console.log(`   💰 Gas price: ${ethers.formatUnits(feeData.gasPrice || 0n, 'gwei')} gwei`);
    
    return { provider, success: true };
  } catch (error) {
    console.log(`   ❌ Connection failed: ${error.message}`);
    return { success: false };
  }
}

/**
 * Test Skrumpeys contract on mainnet
 */
async function testSkrumpeysContract(provider) {
  console.log(`\n🐸 Testing Skrumpeys contract...`);
  console.log(`   Contract: ${SKRUMPEYS_CONTRACT}`);
  
  try {
    const contract = new ethers.Contract(SKRUMPEYS_CONTRACT, ERC721_ABI, provider);
    
    const name = await contract.name();
    const symbol = await contract.symbol();
    const totalSupply = await contract.totalSupply();
    
    console.log(`   ✅ Name: ${name}`);
    console.log(`   ✅ Symbol: ${symbol}`);
    console.log(`   ✅ Total Supply: ${totalSupply.toString()}`);
    
    return true;
  } catch (error) {
    console.log(`   ❌ Contract call failed: ${error.message}`);
    return false;
  }
}

/**
 * Generate a test wallet
 */
function generateTestWallet() {
  console.log(`\n🔑 Generating test wallet...`);
  
  const wallet = ethers.Wallet.createRandom();
  
  console.log(`   ⚠️  WARNING: This is for TESTNET ONLY!`);
  console.log(`   📍 Address: ${wallet.address}`);
  console.log(`   🔐 Private Key: ${wallet.privateKey}`);
  
  return wallet;
}

/**
 * Check wallet balance
 */
async function checkBalance(provider, address) {
  console.log(`\n💰 Checking balance for ${address}...`);
  
  try {
    const balance = await provider.getBalance(address);
    console.log(`   Balance: ${ethers.formatEther(balance)} MON`);
    return balance;
  } catch (error) {
    console.log(`   ❌ Failed to check balance: ${error.message}`);
    return 0n;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║       Star World Order - Network Connection Test               ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  
  // Test mainnet connection
  const mainnetResult = await testConnection(NETWORKS.mainnet);
  
  if (mainnetResult.success) {
    // Test Skrumpeys contract on mainnet
    await testSkrumpeysContract(mainnetResult.provider);
  }
  
  // Test testnet connection
  const testnetResult = await testConnection(NETWORKS.testnet);
  
  if (testnetResult.success) {
    // Generate a test wallet
    const testWallet = generateTestWallet();
    
    // Check balance (will be 0 for new wallet)
    await checkBalance(testnetResult.provider, testWallet.address);
    
    console.log(`\n📋 Next Steps:`);
    console.log(`   1. Go to ${NETWORKS.testnet.faucet}`);
    console.log(`   2. Enter your test wallet address: ${testWallet.address}`);
    console.log(`   3. Request testnet MON tokens`);
    console.log(`   4. Deploy contracts using the private key`);
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('Test complete!');
}

// Run
main().catch(console.error);

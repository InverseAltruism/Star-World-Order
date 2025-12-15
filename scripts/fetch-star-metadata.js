const { ethers } = require('ethers');

// Monad mainnet config
const provider = new ethers.JsonRpcProvider('https://rpc.monad.xyz');
const SKRUMPEYS_CONTRACT = '0xb0dad798c80e40dd6b8e8545074c6a5b7b97d2c0';

// Star Skrumpey IDs (first 20 for testing)
const STAR_IDS = [3, 17, 20, 23, 38, 40, 60, 84, 96, 106, 108, 118, 120, 141, 149, 164, 180, 191, 204, 206];

const ERC721_ABI = [
  'function tokenURI(uint256 tokenId) view returns (string)'
];

async function fetchMetadata(tokenId) {
  try {
    const contract = new ethers.Contract(SKRUMPEYS_CONTRACT, ERC721_ABI, provider);
    const tokenURI = await contract.tokenURI(tokenId);
    
    // Parse metadata
    let metadata;
    if (tokenURI.startsWith('data:application/json;base64,')) {
      const base64Data = tokenURI.replace('data:application/json;base64,', '');
      const jsonStr = Buffer.from(base64Data, 'base64').toString('utf8');
      metadata = JSON.parse(jsonStr);
    } else if (tokenURI.startsWith('data:application/json,')) {
      const jsonStr = decodeURIComponent(tokenURI.replace('data:application/json,', ''));
      metadata = JSON.parse(jsonStr);
    } else {
      console.log(`Token ${tokenId}: Unsupported URI format`);
      return null;
    }
    
    // Look for constellation attribute
    if (metadata.attributes) {
      const constellationAttr = metadata.attributes.find(a => 
        a.trait_type?.toLowerCase() === 'constellation'
      );
      
      if (constellationAttr) {
        return { tokenId, variant: constellationAttr.value };
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Error fetching token ${tokenId}:`, error.message);
    return null;
  }
}

async function main() {
  console.log('Fetching Star Skrumpey metadata from blockchain...\n');
  
  const results = [];
  for (const tokenId of STAR_IDS) {
    const result = await fetchMetadata(tokenId);
    if (result) {
      results.push(result);
      process.stdout.write('.');
    } else {
      process.stdout.write('x');
    }
    // Rate limit
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('\n\n=== RESULTS ===');
  if (results.length > 0) {
    console.log('Variants found:');
    results.forEach(r => console.log(`  Token ${r.tokenId}: ${r.variant}`));
    
    // Group by variant
    const variantGroups = {};
    results.forEach(r => {
      if (!variantGroups[r.variant]) {
        variantGroups[r.variant] = [];
      }
      variantGroups[r.variant].push(r.tokenId);
    });
    
    console.log('\nGrouped by variant:');
    Object.entries(variantGroups).forEach(([variant, ids]) => {
      console.log(`  ${variant}: ${ids.join(', ')}`);
    });
  } else {
    console.log('No variants found');
  }
}

main().catch(console.error);

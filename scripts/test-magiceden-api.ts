/**
 * Test script for Magic Eden API with bearer token
 * 
 * Usage: npx tsx scripts/test-magiceden-api.ts [wallet-address]
 * 
 * Note: Make sure to set MAGIC_EDEN_API_KEY in .env.local
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load environment variables from .env.local manually
try {
  const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8');
  envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
} catch (error) {
  console.warn('⚠️  Could not load .env.local, using process.env only');
}

const MAGIC_EDEN_API = 'https://api-mainnet.magiceden.dev/v4/evm-public/collections/user-collections';
const API_KEY = process.env.MAGIC_EDEN_API_KEY;

// Test wallet address (default: use a known address or provide as argument)
const TEST_WALLET = process.argv[2] || '0xb0dad798c80e40dd6b8e8545074c6a5b7b97d2c0'; // Skrumpey contract as test

async function testMagicEdenAPI() {
  console.log('🧪 Testing Magic Eden API...\n');
  console.log(`📋 Test Wallet: ${TEST_WALLET}`);
  console.log(`🔑 API Key: ${API_KEY ? `${API_KEY.substring(0, 8)}...` : 'Not set (using public endpoint)'}\n`);

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (API_KEY) {
    headers['Authorization'] = `Bearer ${API_KEY}`;
    console.log('✅ Using Bearer token authentication\n');
  } else {
    console.log('⚠️  No API key found - using public endpoint (may have lower rate limits)\n');
  }

  try {
    console.log('📡 Making API request...');
    const startTime = Date.now();
    
    const response = await fetch(MAGIC_EDEN_API, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        chain: 'monad',
        walletAddresses: [TEST_WALLET],
      }),
    });

    const duration = Date.now() - startTime;
    console.log(`⏱️  Response time: ${duration}ms`);
    console.log(`📊 Status: ${response.status} ${response.statusText}\n`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API Error Response:');
      console.error(errorText);
      return;
    }

    const data = await response.json();
    
    console.log('✅ Success! Response data:');
    console.log(JSON.stringify(data, null, 2));
    
    if (data.collections && Array.isArray(data.collections)) {
      console.log(`\n📦 Found ${data.collections.length} collections:`);
      data.collections.forEach((collection: any, index: number) => {
        console.log(`\n  ${index + 1}. ${collection.name || 'Unknown'}`);
        console.log(`     Contract: ${collection.chainData?.contract || collection.id}`);
        console.log(`     Owned: ${collection.ownedCount || 0} NFTs`);
        console.log(`     Verified: ${collection.verification === 'VERIFIED' ? 'Yes' : 'No'}`);
      });
      
      const totalNFTs = data.collections.reduce((sum: number, c: any) => sum + (c.ownedCount || 0), 0);
      console.log(`\n🎯 Total NFTs owned: ${totalNFTs}`);
    }

    // Check rate limit headers
    const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
    const rateLimitReset = response.headers.get('x-ratelimit-reset');
    
    if (rateLimitRemaining) {
      console.log(`\n📈 Rate Limit Remaining: ${rateLimitRemaining}`);
    }
    if (rateLimitReset) {
      console.log(`⏰ Rate Limit Reset: ${new Date(parseInt(rateLimitReset) * 1000).toLocaleString()}`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
      console.error('   Stack:', error.stack);
    }
  }
}

testMagicEdenAPI();

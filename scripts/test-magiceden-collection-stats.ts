/**
 * Test script to check if Magic Eden API has collection statistics/floor price endpoints for Monad
 * 
 * Usage: npx tsx scripts/test-magiceden-collection-stats.ts [contract-address]
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

const API_KEY = process.env.MAGIC_EDEN_API_KEY;
const TEST_CONTRACT = process.argv[2] || '0xb0dad798c80e40dd6b8e8545074c6a5b7b97d2c0'; // Skrumpeys contract

const headers: HeadersInit = {
  'Content-Type': 'application/json',
};

if (API_KEY) {
  headers['Authorization'] = `Bearer ${API_KEY}`;
}

async function testEndpoint(name: string, url: string, method: string = 'GET', body?: any) {
  console.log(`\n🧪 Testing: ${name}`);
  console.log(`   URL: ${url}`);
  console.log(`   Method: ${method}`);
  
  try {
    const startTime = Date.now();
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const duration = Date.now() - startTime;
    
    console.log(`   Status: ${response.status} ${response.statusText} (${duration}ms)`);
    
    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ Success! Response keys:`, Object.keys(data).join(', '));
      if (data.floorPrice !== undefined) {
        console.log(`   💰 Floor Price: ${data.floorPrice}`);
      }
      if (data.stats) {
        console.log(`   📊 Stats available:`, Object.keys(data.stats).join(', '));
      }
      return { success: true, data };
    } else {
      const errorText = await response.text();
      console.log(`   ❌ Error: ${errorText.substring(0, 200)}`);
      return { success: false, status: response.status };
    }
  } catch (error) {
    console.log(`   ❌ Exception:`, error instanceof Error ? error.message : String(error));
    return { success: false, error };
  }
}

async function main() {
  console.log('🔍 Testing Magic Eden API endpoints for Monad collection statistics\n');
  console.log(`📋 Test Contract: ${TEST_CONTRACT}`);
  console.log(`🔑 API Key: ${API_KEY ? `${API_KEY.substring(0, 8)}...` : 'Not set'}\n`);

  const baseUrl = 'https://api-mainnet.magiceden.dev';
  
  // Test various potential endpoints
  const endpoints = [
    // EVM v4 endpoints
    {
      name: 'Collection Stats (v4)',
      url: `${baseUrl}/v4/evm-public/collections/${TEST_CONTRACT}/stats`,
      method: 'GET',
    },
    {
      name: 'Collection Info (v4)',
      url: `${baseUrl}/v4/evm-public/collections/${TEST_CONTRACT}`,
      method: 'GET',
    },
    {
      name: 'Collection Listings (v4)',
      url: `${baseUrl}/v4/evm-public/collections/${TEST_CONTRACT}/listings?limit=10`,
      method: 'GET',
    },
    // EVM v3 endpoints (legacy)
    {
      name: 'Collection Stats (v3)',
      url: `${baseUrl}/v3/monad/collections/${TEST_CONTRACT}/stats`,
      method: 'GET',
    },
    {
      name: 'Collection Listings (v3)',
      url: `${baseUrl}/v3/monad/collections/${TEST_CONTRACT}/listings?limit=10`,
      method: 'GET',
    },
  ];

  const results = [];
  for (const endpoint of endpoints) {
    const result = await testEndpoint(endpoint.name, endpoint.url, endpoint.method);
    results.push({ ...endpoint, ...result });
    await new Promise(resolve => setTimeout(resolve, 500)); // Rate limit protection
  }

  console.log('\n📊 Summary:');
  console.log('='.repeat(60));
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`✅ Successful: ${successful.length}`);
  successful.forEach(r => {
    console.log(`   - ${r.name}`);
  });
  
  console.log(`\n❌ Failed: ${failed.length}`);
  failed.forEach(r => {
    console.log(`   - ${r.name} (${r.status || 'error'})`);
  });

  // If we found listings, try to calculate floor price
  const listingsResult = results.find(r => r.name.includes('Listings') && r.success);
  if (listingsResult && listingsResult.data) {
    console.log('\n💰 Analyzing listings for floor price...');
    try {
      const listings = listingsResult.data.listings || listingsResult.data.results || [];
      if (Array.isArray(listings) && listings.length > 0) {
        const prices = listings
          .map((l: any) => parseFloat(l.price || l.priceInNative || l.priceInSol || 0))
          .filter((p: number) => !isNaN(p) && p > 0)
          .sort((a: number, b: number) => a - b);
        
        if (prices.length > 0) {
          const floorPrice = prices[0];
          console.log(`   ✅ Floor Price from listings: ${floorPrice} MON`);
          console.log(`   📊 Total listings analyzed: ${prices.length}`);
        }
      }
    } catch (error) {
      console.log(`   ⚠️  Could not parse listings:`, error);
    }
  }
}

main().catch(console.error);

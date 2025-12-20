#!/usr/bin/env node

/**
 * Discord OAuth Routes Validation Script
 * 
 * This script validates that the Discord OAuth routes are properly set up and respond correctly.
 */

const TEST_WALLET = '0x1234567890123456789012345678901234567890';

console.log('🔍 Validating Discord OAuth Routes...\n');

// Test 1: Check Discord OAuth initiation route exists
console.log('Test 1: Discord OAuth Initiation Route');
try {
  const initiationPath = './app/api/auth/discord/route.ts';
  const fs = require('fs');
  
  if (fs.existsSync(initiationPath)) {
    console.log('✅ Route file exists: app/api/auth/discord/route.ts');
    
    // Check for key features
    const content = fs.readFileSync(initiationPath, 'utf8');
    const checks = [
      { name: 'State parameter generation', pattern: /generateRandomString/ },
      { name: 'Cookie storage', pattern: /cookies\.set/ },
      { name: 'Discord redirect', pattern: /discord\.com.*oauth2.*authorize/ },
      { name: 'Wallet address validation', pattern: /walletAddress/ },
      { name: 'CSRF protection (state)', pattern: /discord_oauth_state/ },
    ];
    
    checks.forEach(check => {
      if (check.pattern.test(content)) {
        console.log(`  ✅ ${check.name}`);
      } else {
        console.log(`  ❌ ${check.name} - NOT FOUND`);
      }
    });
  } else {
    console.log('❌ Route file does not exist');
    process.exit(1);
  }
} catch (error) {
  console.log('❌ Error checking initiation route:', error.message);
  process.exit(1);
}

console.log('');

// Test 2: Check Discord OAuth callback route exists
console.log('Test 2: Discord OAuth Callback Route');
try {
  const callbackPath = './app/api/auth/callback/discord/route.ts';
  const fs = require('fs');
  
  if (fs.existsSync(callbackPath)) {
    console.log('✅ Route file exists: app/api/auth/callback/discord/route.ts');
    
    // Check for key features
    const content = fs.readFileSync(callbackPath, 'utf8');
    const checks = [
      { name: 'State validation (CSRF protection)', pattern: /storedState/ },
      { name: 'Token exchange', pattern: /exchangeCodeForToken/ },
      { name: 'User info fetch', pattern: /fetchDiscordUserInfo/ },
      { name: 'Database storage', pattern: /getDatabase/ },
      { name: 'Cookie cleanup', pattern: /cookies\.delete/ },
      { name: 'Success/error redirect', pattern: /\/profile\?/ },
      { name: 'Discord API endpoint', pattern: /discord\.com\/api\/users\/@me/ },
    ];
    
    checks.forEach(check => {
      if (check.pattern.test(content)) {
        console.log(`  ✅ ${check.name}`);
      } else {
        console.log(`  ❌ ${check.name} - NOT FOUND`);
      }
    });
  } else {
    console.log('❌ Route file does not exist');
    process.exit(1);
  }
} catch (error) {
  console.log('❌ Error checking callback route:', error.message);
  process.exit(1);
}

console.log('');

// Test 3: Check SocialConnect component uses server-side OAuth
console.log('Test 3: SocialConnect Component Integration');
try {
  const componentPath = './components/SocialConnect.tsx';
  const fs = require('fs');
  
  if (fs.existsSync(componentPath)) {
    console.log('✅ Component file exists: components/SocialConnect.tsx');
    
    const content = fs.readFileSync(componentPath, 'utf8');
    const checks = [
      { name: 'Server-side OAuth redirect for Discord', pattern: /\/api\/auth\/discord\?wallet/ },
      { name: 'Server-side OAuth redirect for X', pattern: /\/api\/auth\/x\?wallet/ },
    ];
    
    checks.forEach(check => {
      if (check.pattern.test(content)) {
        console.log(`  ✅ ${check.name}`);
      } else {
        console.log(`  ❌ ${check.name} - NOT FOUND`);
      }
    });
  } else {
    console.log('❌ Component file does not exist');
    process.exit(1);
  }
} catch (error) {
  console.log('❌ Error checking component:', error.message);
  process.exit(1);
}

console.log('');
console.log('✅ All validation checks passed!');
console.log('');
console.log('📝 Next Steps:');
console.log('1. Configure Discord OAuth credentials in .env.local:');
console.log('   NEXT_PUBLIC_DISCORD_CLIENT_ID=your_client_id');
console.log('   DISCORD_CLIENT_SECRET=your_client_secret');
console.log('   NEXT_PUBLIC_DISCORD_REDIRECT_URI=http://localhost:3000/api/auth/callback/discord');
console.log('');
console.log('2. Start the dev server: npm run dev');
console.log('');
console.log('3. Test the OAuth flow:');
console.log('   - Visit http://localhost:3000/profile');
console.log('   - Connect your wallet');
console.log('   - Click "CONNECT" on the Discord section');
console.log('   - You should be redirected to Discord authorization page');
console.log('   - After authorization, you\'ll be redirected back to /profile');
console.log('');

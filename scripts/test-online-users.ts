#!/usr/bin/env tsx
/**
 * Test script to verify getOnlineUsers() datetime comparison fix
 */
import { getDatabase, updateOnlinePresence, getOnlineUsers, removeOnlinePresence } from '../lib/db';

console.log('Testing getOnlineUsers() datetime comparison fix...\n');

// Clean up any existing test data
const testWallets = ['0xtest1', '0xtest2', '0xtest3'];
for (const wallet of testWallets) {
  try {
    removeOnlinePresence(wallet);
  } catch (e) {
    // Ignore if doesn't exist
  }
}

// Test Case 1: User active within last 2 minutes (should appear)
console.log('Test 1: User active within last 2 minutes');
updateOnlinePresence('0xtest1', {
  displayName: 'Active User',
  status: 'online'
});
let onlineUsers = getOnlineUsers();
console.log(`  Expected: 1 user online`);
console.log(`  Got: ${onlineUsers.length} user(s) online`);
console.log(`  Result: ${onlineUsers.length === 1 ? '✅ PASS' : '❌ FAIL'}\n`);

// Test Case 2: Add another active user
console.log('Test 2: Two users active');
updateOnlinePresence('0xtest2', {
  displayName: 'Active User 2',
  status: 'online'
});
onlineUsers = getOnlineUsers();
console.log(`  Expected: 2 users online`);
console.log(`  Got: ${onlineUsers.length} user(s) online`);
console.log(`  Result: ${onlineUsers.length === 2 ? '✅ PASS' : '❌ FAIL'}\n`);

// Test Case 3: Simulate old user (manually set old timestamp in DB)
console.log('Test 3: Old user should not appear');
const db = getDatabase();
db.prepare(`
  UPDATE online_presence 
  SET last_seen = datetime('now', '-5 minutes')
  WHERE wallet_address = ?
`).run('0xtest2');

onlineUsers = getOnlineUsers();
console.log(`  Expected: 1 user online (0xtest2 should be filtered out)`);
console.log(`  Got: ${onlineUsers.length} user(s) online`);
console.log(`  Result: ${onlineUsers.length === 1 ? '✅ PASS' : '❌ FAIL'}\n`);

// Clean up
for (const wallet of testWallets) {
  try {
    removeOnlinePresence(wallet);
  } catch (e) {
    // Ignore
  }
}

console.log('All tests completed!');

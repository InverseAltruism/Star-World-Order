#!/usr/bin/env tsx
/**
 * Comprehensive test for all datetime comparison fixes
 */
import { 
  getDatabase, 
  updateOnlinePresence, 
  getOnlineUsers, 
  removeOnlinePresence,
  addChatMessage,
  getChatMessagesSince,
  cleanupOldData
} from '../lib/db';

console.log('🧪 Testing all datetime comparison fixes...\n');

const testWallets = ['0xtest1', '0xtest2', '0xtest3'];
const db = getDatabase();

// Clean up test data
function cleanup() {
  for (const wallet of testWallets) {
    try {
      removeOnlinePresence(wallet);
    } catch (e) {}
  }
  db.prepare('DELETE FROM chat_messages WHERE sender_address LIKE ?').run('0xtest%');
}

cleanup();

// ==============================================
// Test 1: getOnlineUsers() with datetime comparison
// ==============================================
console.log('Test 1: getOnlineUsers() datetime comparison');

// Add current user
updateOnlinePresence('0xtest1', { displayName: 'Active User', status: 'online' });

// Add old user (5 minutes ago)
db.prepare(`
  INSERT INTO online_presence (wallet_address, display_name, status, last_seen, created_at)
  VALUES (?, ?, ?, datetime('now', '-5 minutes'), datetime('now', '-5 minutes'))
`).run('0xtest2', 'Old User', 'online');

let onlineUsers = getOnlineUsers();
console.log(`  Expected: 1 user (only recent user)`);
console.log(`  Got: ${onlineUsers.length} user(s)`);
console.log(`  Result: ${onlineUsers.length === 1 && onlineUsers[0].wallet_address === '0xtest1' ? '✅ PASS' : '❌ FAIL'}\n`);

// ==============================================
// Test 2: getChatMessagesSince() with datetime comparison
// ==============================================
console.log('Test 2: getChatMessagesSince() datetime comparison');

// Add some messages
addChatMessage('0xtest1', 'Message 1', 'chat', 'User1');
addChatMessage('0xtest2', 'Message 2', 'chat', 'User2');

// Get current time in ISO format (like the client would send)
const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();

const recentMessages = getChatMessagesSince(oneMinuteAgo);
console.log(`  Expected: 2 messages (both are recent)`);
console.log(`  Got: ${recentMessages.length} message(s)`);
console.log(`  Result: ${recentMessages.length === 2 ? '✅ PASS' : '❌ FAIL'}\n`);

// Test with old timestamp (should get all messages)
const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const allMessages = getChatMessagesSince(hourAgo);
console.log(`  Expected: 2 messages (both within last hour)`);
console.log(`  Got: ${allMessages.length} message(s)`);
console.log(`  Result: ${allMessages.length === 2 ? '✅ PASS' : '❌ FAIL'}\n`);

// ==============================================
// Test 3: cleanupOldData() with datetime comparison
// ==============================================
console.log('Test 3: cleanupOldData() datetime comparison');

// Add an old chat message (25 hours ago)
db.prepare(`
  INSERT INTO chat_messages (sender_address, message, message_type, created_at)
  VALUES (?, ?, ?, datetime('now', '-25 hours'))
`).run('0xtest3', 'Very old message', 'chat');

// Count messages before cleanup
const beforeCount = db.prepare('SELECT COUNT(*) as count FROM chat_messages WHERE sender_address LIKE ?').get('0xtest%') as { count: number };
console.log(`  Messages before cleanup: ${beforeCount.count}`);

// Run cleanup
cleanupOldData();

// Count messages after cleanup
const afterCount = db.prepare('SELECT COUNT(*) as count FROM chat_messages WHERE sender_address LIKE ?').get('0xtest%') as { count: number };
console.log(`  Messages after cleanup: ${afterCount.count}`);
console.log(`  Expected: 2 messages (old one removed)`);
console.log(`  Result: ${afterCount.count === 2 ? '✅ PASS' : '❌ FAIL'}\n`);

// Check if old presence was cleaned up
const presenceAfterCleanup = getOnlineUsers();
console.log(`  Online users after cleanup: ${presenceAfterCleanup.length}`);
console.log(`  Expected: 1 user (0xtest2 removed, only 0xtest1 remains)`);
console.log(`  Result: ${presenceAfterCleanup.length === 1 ? '✅ PASS' : '❌ FAIL'}\n`);

// Clean up
cleanup();

console.log('✨ All datetime comparison tests completed!');

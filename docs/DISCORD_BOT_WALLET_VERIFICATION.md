# Discord Bot: Wallet Verification via MON Transfer

This document provides step-by-step instructions for adding wallet verification via MON transfer to the Star World Order Discord bot.

## Overview

Currently, users can link their wallet to Discord by:
1. **Website OAuth** - Connect Discord on starworldorder.com/profile

This update adds a second method:
2. **Discord `/link` command** - Verify wallet ownership by sending 1 MON to a verification address

## How It Works

1. User runs `/link 0xTheirWallet`
2. Bot provides a verification address and instructs user to send 1 MON
3. User sends 1 MON from their wallet to the verification address
4. User clicks "Verify Transaction" button
5. Bot checks blockchain for matching transaction (must be from the claimed wallet, after verification started)
6. If found, wallet is linked to Discord in `social_connections` table (same as website OAuth)
7. User gets appropriate holder role based on Star Skrumpey ownership
8. If user sells their Stars, they lose the role on next 5-minute sync

## Security Considerations

The verification system is designed with the following security measures:

1. **Timestamp Validation**: Only accepts transactions that occurred AFTER the verification request was initiated
2. **Exact Wallet Match**: The transaction must be FROM the exact wallet the user is trying to verify
3. **One-to-One Mapping**: Each wallet can only be linked to one Discord account
4. **Time-Limited**: Verification sessions expire after 10 minutes

**Note**: This is a basic proof-of-ownership system suitable for community use. For high-security applications, consider additional measures like signed messages.

---

## Step 1: Add Environment Variables

Add these to your `.env.bot` file:

```bash
# Wallet Verification Configuration
# Address where users send MON to verify ownership
VERIFICATION_ADDRESS=0xYourVerificationAddressHere

# Amount in MON (as string)
VERIFICATION_AMOUNT=1

# Discord Client ID (needed for button interactions)
DISCORD_CLIENT_ID=your-discord-client-id
```

**Important**: The `VERIFICATION_ADDRESS` should be:
- The DAO treasury address, OR
- A dedicated verification wallet you control

The MON sent is NOT consumed - it's just proof of ownership. You can return it or keep it for treasury.

---

## Step 2: Update Config Object

Update your config object in `index.ts`:

```typescript
const config = {
  // ... existing config ...
  
  // Add these new fields:
  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID!,
  VERIFICATION_ADDRESS: process.env.VERIFICATION_ADDRESS || '',
  VERIFICATION_AMOUNT: process.env.VERIFICATION_AMOUNT || '1',
};
```

---

## Step 3: Add Database Table for Verification Tracking

Add this function after your database connection:

```typescript
/**
 * Initialize the wallet_verifications table for tracking pending verifications
 */
function initializeWalletVerificationTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS wallet_verifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_user_id TEXT NOT NULL,
      discord_username TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      verification_amount TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'expired', 'cancelled')),
      tx_hash TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      confirmed_at DATETIME
    )
  `);
  
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_wallet_verifications_user ON wallet_verifications(discord_user_id, status);
    CREATE INDEX IF NOT EXISTS idx_wallet_verifications_wallet ON wallet_verifications(wallet_address, status);
  `);
}
```

Call it after database connection in the `ready` event:

```typescript
client.on('ready', async () => {
  // ... existing code ...
  
  try {
    db = new Database(config.DB_PATH);
    console.log(`📊 Connected to database: ${config.DB_PATH}`);
    
    // Initialize verification table
    initializeWalletVerificationTable();
    console.log('📋 Wallet verification table ready');
  } catch (error) {
    // ... existing error handling ...
  }
  
  // ... rest of ready handler ...
});
```

---

## Step 4: Add Helper Functions

Add these helper functions for database operations and blockchain checking:

```typescript
import { parseEther, isAddress } from 'viem';

// Store pending verifications in memory (discord user id -> verification data)
interface PendingVerification {
  discordUserId: string;
  discordUsername: string;
  walletAddress: string;
  startedAt: number;
  expectedAmount: string;
}

const pendingVerifications = new Map<string, PendingVerification>();

/**
 * Check if a wallet is already linked to any Discord account
 */
function isWalletAlreadyLinked(walletAddress: string): DiscordConnection | null {
  const stmt = db.prepare(`
    SELECT wallet_address, platform_user_id, username
    FROM social_connections
    WHERE platform = 'discord' AND LOWER(wallet_address) = LOWER(?)
  `);
  return (stmt.get(walletAddress) as DiscordConnection) || null;
}

/**
 * Get Discord connection by user ID
 */
function getConnectionByDiscordId(discordUserId: string): DiscordConnection | null {
  const stmt = db.prepare(`
    SELECT wallet_address, platform_user_id, username
    FROM social_connections
    WHERE platform = 'discord' AND platform_user_id = ?
  `);
  return (stmt.get(discordUserId) as DiscordConnection) || null;
}

/**
 * Save Discord connection to database (same as website OAuth)
 */
function saveDiscordConnection(
  walletAddress: string,
  discordUserId: string,
  discordUsername: string
): void {
  const stmt = db.prepare(`
    INSERT INTO social_connections (
      wallet_address, platform, platform_user_id, username
    )
    VALUES (?, 'discord', ?, ?)
    ON CONFLICT(wallet_address, platform) DO UPDATE SET
      platform_user_id = excluded.platform_user_id,
      username = excluded.username,
      updated_at = CURRENT_TIMESTAMP
  `);
  
  stmt.run(walletAddress.toLowerCase(), discordUserId, discordUsername);
}

/**
 * Record a pending verification in the database
 */
function recordPendingVerification(
  discordUserId: string,
  discordUsername: string,
  walletAddress: string,
  verificationAmount: string
): void {
  // Cancel any existing pending verifications for this user
  db.prepare(`
    UPDATE wallet_verifications
    SET status = 'cancelled'
    WHERE discord_user_id = ? AND status = 'pending'
  `).run(discordUserId);
  
  // Insert new pending verification
  db.prepare(`
    INSERT INTO wallet_verifications (
      discord_user_id, discord_username, wallet_address, verification_amount
    )
    VALUES (?, ?, ?, ?)
  `).run(discordUserId, discordUsername, walletAddress.toLowerCase(), verificationAmount);
}

/**
 * Mark a verification as confirmed
 */
function confirmVerification(
  discordUserId: string,
  walletAddress: string,
  txHash: string
): void {
  db.prepare(`
    UPDATE wallet_verifications
    SET status = 'confirmed', tx_hash = ?, confirmed_at = CURRENT_TIMESTAMP
    WHERE discord_user_id = ? AND LOWER(wallet_address) = LOWER(?) AND status = 'pending'
  `).run(txHash, discordUserId, walletAddress);
}

/**
 * Remove Discord connection from database
 */
function removeDiscordConnection(discordUserId: string): boolean {
  const result = db.prepare(`
    DELETE FROM social_connections
    WHERE platform = 'discord' AND platform_user_id = ?
  `).run(discordUserId);
  return result.changes > 0;
}

/**
 * Check for incoming MON transfer from a specific wallet to verification address
 */
async function checkForVerificationTransaction(
  fromAddress: string,
  expectedAmountMON: string,
  sinceTimestamp: number
): Promise<{ found: boolean; txHash?: string }> {
  try {
    const currentBlock = await monad.getBlockNumber();
    const expectedAmountWei = parseEther(expectedAmountMON);
    
    // Check last 100 blocks for matching transaction
    for (let i = 0; i < 100; i++) {
      const blockNumber = currentBlock - BigInt(i);
      try {
        const block = await monad.getBlock({
          blockNumber,
          includeTransactions: true,
        });
        
        // Check if block is too old (before verification started)
        const blockTimestamp = Number(block.timestamp) * 1000;
        if (blockTimestamp < sinceTimestamp) {
          break;
        }
        
        // Look for matching transaction
        for (const tx of block.transactions) {
          if (typeof tx === 'object' && 
              tx.from.toLowerCase() === fromAddress.toLowerCase() &&
              tx.to?.toLowerCase() === config.VERIFICATION_ADDRESS.toLowerCase() &&
              tx.value >= expectedAmountWei) {
            return { found: true, txHash: tx.hash };
          }
        }
      } catch {
        continue;
      }
    }
    
    return { found: false };
  } catch (error) {
    console.error('Error checking for verification transaction:', error);
    return { found: false };
  }
}
```

---

## Step 5: Add New Imports

Update your imports at the top of `index.ts`:

```typescript
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  ChatInputCommandInteraction,
  ButtonInteraction,
} from 'discord.js';
import {
  createPublicClient,
  http,
  Address,
  defineChain,
  parseEther,
  isAddress,
} from 'viem';
```

---

## Step 6: Register New Slash Commands

Update your slash command registration in the `ready` event:

```typescript
await rest.put(
  Routes.applicationGuildCommands(client.user!.id, config.DISCORD_GUILD_ID),
  {
    body: [
      new SlashCommandBuilder()
        .setName('verify')
        .setDescription('Verify your Star Skrumpey holdings'),
      new SlashCommandBuilder()
        .setName('status')
        .setDescription('Check your verification status'),
      new SlashCommandBuilder()
        .setName('tiers')
        .setDescription('View holder tier requirements'),
      // NEW: /link command
      new SlashCommandBuilder()
        .setName('link')
        .setDescription('Link your wallet by sending a small MON transfer')
        .addStringOption(option =>
          option
            .setName('wallet')
            .setDescription('Your Monad wallet address (0x...)')
            .setRequired(true)
        ),
      // NEW: /unlink command
      new SlashCommandBuilder()
        .setName('unlink')
        .setDescription('Unlink your wallet from Discord'),
    ].map(c => c.toJSON()),
  }
);
```

---

## Step 7: Add Command Handlers

Replace your `interactionCreate` handler with this expanded version:

```typescript
client.on('interactionCreate', async (interaction) => {
  // Handle button interactions for verification
  if (interaction.isButton()) {
    await handleButtonInteraction(interaction);
    return;
  }
  
  if (!interaction.isChatInputCommand()) return;

  // /tiers command
  if (interaction.commandName === 'tiers') {
    await interaction.reply({
      content: `🏆 **Star World Order Holder Tiers**\n\n👑 **COSMIC EMPEROR** - 10+ Stars\n⚔️ **STAR LORD** - 5-9 Stars\n🛡️ **COSMIC WARDEN** - 2-4 Stars\n⭐ **STAR FORGED** - 1 Star\n\n🔗 Connect at: https://starworldorder.com/profile`,
    });
    return;
  }

  // /verify and /status commands
  if (interaction.commandName === 'verify' || interaction.commandName === 'status') {
    await interaction.deferReply({ ephemeral: true });

    const discordId = interaction.user.id;
    const connection = getConnectionByDiscordId(discordId);

    if (!connection) {
      await interaction.editReply({
        content: '❌ **No wallet connected!**\n\nUse `/link <wallet>` to verify via MON transfer, or connect at: https://starworldorder.com/profile',
      });
      return;
    }

    const stars = await countStars(connection.wallet_address);
    const tier = getTier(stars);

    if (interaction.commandName === 'verify' && tier) {
      await syncUser(discordId, connection.wallet_address, connection.username);
    }

    const walletShort = `${connection.wallet_address.slice(0, 6)}...${connection.wallet_address.slice(-4)}`;

    await interaction.editReply({
      content: tier
        ? `${tier.emoji} **Verified ${tier.name}!**\n\n💼 Wallet: \`${walletShort}\`\n⭐ Stars: **${stars}**`
        : `❌ **Not a Star Holder**\n\n💼 Wallet: \`${walletShort}\`\n⭐ Stars: **0**\n\n🛒 Get yours: https://magiceden.io/collections/monad/skrumpeys`,
    });
    return;
  }

  // /link command - NEW
  if (interaction.commandName === 'link') {
    await handleLinkCommand(interaction);
    return;
  }

  // /unlink command - NEW
  if (interaction.commandName === 'unlink') {
    await handleUnlinkCommand(interaction);
    return;
  }
});

/**
 * Handle /link command - Start wallet verification process
 * 
 * Note: Using ChatInputCommandInteraction type for full type safety.
 * If you have TypeScript issues, you can use `any` as a fallback.
 */
async function handleLinkCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const walletAddress = interaction.options.getString('wallet', true);
  
  // Validate wallet address format
  if (!isAddress(walletAddress)) {
    await interaction.reply({
      content: '❌ **Invalid Wallet Address**\n\nPlease provide a valid wallet address starting with `0x`.',
      ephemeral: true,
    });
    return;
  }
  
  // Check if this Discord user already has a linked wallet
  const existingConnection = getConnectionByDiscordId(interaction.user.id);
  if (existingConnection) {
    await interaction.reply({
      content: `⚠️ **Wallet Already Linked**\n\nYou already have a wallet linked:\n\`${existingConnection.wallet_address}\`\n\nUse \`/unlink\` first if you want to link a different wallet.`,
      ephemeral: true,
    });
    return;
  }
  
  // Check if this wallet is already linked to another Discord account
  const walletLinked = isWalletAlreadyLinked(walletAddress);
  if (walletLinked) {
    await interaction.reply({
      content: '❌ **Wallet Already Linked**\n\nThis wallet is already linked to another Discord account.',
      ephemeral: true,
    });
    return;
  }
  
  // Check if verification address is configured
  if (!config.VERIFICATION_ADDRESS) {
    await interaction.reply({
      content: '❌ **Configuration Error**\n\nWallet verification is not configured. Please contact an admin.',
      ephemeral: true,
    });
    return;
  }
  
  // Store pending verification
  const verification: PendingVerification = {
    discordUserId: interaction.user.id,
    discordUsername: interaction.user.username,
    walletAddress: walletAddress.toLowerCase(),
    startedAt: Date.now(),
    expectedAmount: config.VERIFICATION_AMOUNT,
  };
  pendingVerifications.set(interaction.user.id, verification);
  
  // Record in database
  recordPendingVerification(
    interaction.user.id,
    interaction.user.username,
    walletAddress,
    config.VERIFICATION_AMOUNT
  );
  
  const walletShort = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
  
  // Create verification instructions embed
  const embed = new EmbedBuilder()
    .setColor(0x00BFFF)
    .setTitle('🔗 Wallet Verification')
    .setDescription(`To verify ownership of wallet \`${walletShort}\`, please send **${config.VERIFICATION_AMOUNT} MON** to the verification address.`)
    .addFields(
      { name: '📤 Send From', value: `\`${walletAddress}\``, inline: false },
      { name: '📥 Send To', value: `\`${config.VERIFICATION_ADDRESS}\``, inline: false },
      { name: '💰 Amount', value: `\`${config.VERIFICATION_AMOUNT} MON\``, inline: true },
      { name: '⏱️ Time Limit', value: '10 minutes', inline: true }
    )
    .setFooter({ text: 'Click "Verify Transaction" after sending' })
    .setTimestamp();
  
  // Create buttons
  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('check_verification')
        .setLabel('Verify Transaction')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId('cancel_verification')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('❌')
    );
  
  await interaction.reply({ 
    embeds: [embed], 
    components: [row],
    ephemeral: true,
  });
  
  // Set up timeout to clean up pending verification
  setTimeout(() => {
    pendingVerifications.delete(interaction.user.id);
  }, 10 * 60 * 1000); // 10 minutes
}

/**
 * Handle button interactions for verification
 * 
 * Note: Using ButtonInteraction type for full type safety.
 * If you have TypeScript issues, you can use `any` as a fallback.
 */
async function handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
  if (interaction.customId === 'cancel_verification') {
    pendingVerifications.delete(interaction.user.id);
    
    const embed = new EmbedBuilder()
      .setColor(0xFFAA00)
      .setTitle('❌ Verification Cancelled')
      .setDescription('Wallet verification has been cancelled.')
      .setTimestamp();
    
    await interaction.update({ embeds: [embed], components: [] });
    return;
  }
  
  if (interaction.customId === 'check_verification') {
    await interaction.deferUpdate();
    
    const pending = pendingVerifications.get(interaction.user.id);
    if (!pending) {
      const embed = new EmbedBuilder()
        .setColor(0xFF6B6B)
        .setTitle('❌ Verification Expired')
        .setDescription('This verification session has expired. Please use `/link` again.')
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed], components: [] });
      return;
    }
    
    // Check for the verification transaction
    const { found, txHash } = await checkForVerificationTransaction(
      pending.walletAddress,
      pending.expectedAmount,
      pending.startedAt
    );
    
    if (found && txHash) {
      // Verification successful!
      pendingVerifications.delete(interaction.user.id);
      
      // Save to database (same as website OAuth)
      saveDiscordConnection(
        pending.walletAddress,
        pending.discordUserId,
        pending.discordUsername
      );
      
      // Mark verification as confirmed
      confirmVerification(
        pending.discordUserId,
        pending.walletAddress,
        txHash
      );
      
      // Count stars and update roles
      const stars = await countStars(pending.walletAddress);
      const tier = getTier(stars);
      
      // Sync user roles
      await syncUser(pending.discordUserId, pending.walletAddress, pending.discordUsername);
      
      const walletShort = `${pending.walletAddress.slice(0, 6)}...${pending.walletAddress.slice(-4)}`;
      const txShort = `${txHash.slice(0, 10)}...${txHash.slice(-8)}`;
      
      const embed = new EmbedBuilder()
        .setColor(0x00FF88)
        .setTitle('✅ Wallet Verified!')
        .setDescription('Your wallet has been successfully linked to your Discord account.')
        .addFields(
          { name: '💎 Wallet', value: `\`${walletShort}\``, inline: false },
          { name: '⭐ Stars Owned', value: String(stars), inline: true },
          { name: '🏆 Tier', value: tier ? `${tier.emoji} ${tier.name}` : 'None (need 1+ Stars)', inline: true },
          { name: '📜 Transaction', value: `\`${txShort}\``, inline: false }
        )
        .setFooter({ text: 'Your roles will update automatically every 5 minutes' })
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed], components: [] });
    } else {
      // Transaction not found yet
      const walletShort = `${pending.walletAddress.slice(0, 6)}...${pending.walletAddress.slice(-4)}`;
      
      const embed = new EmbedBuilder()
        .setColor(0xFFAA00)
        .setTitle('⏳ Transaction Not Found')
        .setDescription(`No matching transaction found yet.\n\nMake sure you:\n• Send from: \`${walletShort}\`\n• Send to: \`${config.VERIFICATION_ADDRESS}\`\n• Amount: **${pending.expectedAmount} MON** or more\n\nClick "Verify Transaction" again after sending.`)
        .setTimestamp();
      
      // Keep the buttons so user can try again
      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('check_verification')
            .setLabel('Verify Transaction')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('✅'),
          new ButtonBuilder()
            .setCustomId('cancel_verification')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('❌')
        );
      
      await interaction.editReply({ embeds: [embed], components: [row] });
    }
  }
}

/**
 * Handle /unlink command
 * 
 * Note: Using ChatInputCommandInteraction type for full type safety.
 */
async function handleUnlinkCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const connection = getConnectionByDiscordId(interaction.user.id);
  
  if (!connection) {
    await interaction.reply({
      content: '⚠️ **No Wallet Linked**\n\nYou don\'t have a wallet linked to your Discord account.',
      ephemeral: true,
    });
    return;
  }
  
  // Remove connection
  const removed = removeDiscordConnection(interaction.user.id);
  
  if (removed) {
    // Remove holder roles
    const guild = await client.guilds.fetch(config.DISCORD_GUILD_ID);
    const member = await guild.members.fetch(interaction.user.id).catch(() => null);
    
    if (member) {
      const current = ALL_TIER_ROLE_IDS.filter(r => member.roles.cache.has(r));
      if (current.length) {
        await member.roles.remove(current);
      }
    }
    
    const walletShort = `${connection.wallet_address.slice(0, 6)}...${connection.wallet_address.slice(-4)}`;
    
    await interaction.reply({
      content: `✅ **Wallet Unlinked**\n\nYour wallet \`${walletShort}\` has been unlinked and holder roles removed.`,
      ephemeral: true,
    });
  } else {
    await interaction.reply({
      content: '❌ **Error**\n\nFailed to unlink wallet. Please try again or contact an admin.',
      ephemeral: true,
    });
  }
}
```

---

## Step 8: Full Updated index.ts

Here's the complete updated `index.ts` file for reference:

```typescript
/**
 * Star World Order – Discord Role Verification Bot
 * 
 * Features:
 * - /verify - Check holdings & update role
 * - /status - View verification status
 * - /tiers - Display tier requirements
 * - /link - Link wallet via MON transfer verification (NEW)
 * - /unlink - Unlink wallet from Discord (NEW)
 * - Automatic role sync every 5 minutes
 * - Removes roles when user sells Star Skrumpeys
 */

import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ChatInputCommandInteraction,
  ButtonInteraction,
} from 'discord.js';
import Database from 'better-sqlite3';
import {
  createPublicClient,
  http,
  Address,
  defineChain,
  parseEther,
  isAddress,
} from 'viem';
import dotenv from 'dotenv';

// ENV
dotenv.config({ path: '/opt/star_world_order/SWO_bot/.env.bot' });

// CONFIG
const config = {
  DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN!,
  DISCORD_GUILD_ID: process.env.DISCORD_GUILD_ID!,
  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID!,

  COSMIC_EMPEROR_ROLE_ID: process.env.COSMIC_EMPEROR_ROLE_ID!,
  STAR_LORD_ROLE_ID: process.env.STAR_LORD_ROLE_ID!,
  COSMIC_WARDEN_ROLE_ID: process.env.COSMIC_WARDEN_ROLE_ID!,
  STAR_FORGED_ROLE_ID: process.env.STAR_FORGED_ROLE_ID!,

  DB_PATH: process.env.DB_PATH || '/opt/swo/data/swo.db',
  MONAD_RPC: process.env.MONAD_RPC || 'https://testnet-rpc.monad.xyz',

  SKRUMPEY_CONTRACT: '0xB0DAD798C80e40Dd6b8E8545074C6a5B7B97D2c0' as Address,
  
  // NEW: Wallet verification config
  VERIFICATION_ADDRESS: process.env.VERIFICATION_ADDRESS || '',
  VERIFICATION_AMOUNT: process.env.VERIFICATION_AMOUNT || '1',

  SYNC_INTERVAL_MS: 5 * 60 * 1000,
};

// TIERS
const TIERS = [
  { min: 10, roleId: config.COSMIC_EMPEROR_ROLE_ID, name: 'COSMIC EMPEROR', emoji: '👑' },
  { min: 5, roleId: config.STAR_LORD_ROLE_ID, name: 'STAR LORD', emoji: '⚔️' },
  { min: 2, roleId: config.COSMIC_WARDEN_ROLE_ID, name: 'COSMIC WARDEN', emoji: '🛡️' },
  { min: 1, roleId: config.STAR_FORGED_ROLE_ID, name: 'STAR FORGED', emoji: '⭐' },
] as const;

const ALL_TIER_ROLE_IDS = TIERS.map(t => t.roleId);

// STAR IDS (333 total)
const STAR_SKRUMPEY_IDS: number[] = [
  3, 17, 20, 23, 38, 40, 60, 84, 96, 106, 108, 118, 120, 141, 149, 164, 180, 191,
  204, 206, 211, 226, 258, 270, 271, 274, 294, 332, 338, 339, 341, 346, 357, 362,
  368, 406, 421, 431, 439, 442, 456, 461, 511, 533, 547, 558, 562, 563, 567, 588,
  594, 596, 627, 629, 643, 650, 652, 659, 672, 675, 680, 693, 701, 704, 705, 709,
  710, 714, 717, 726, 753, 759, 760, 762, 775, 794, 800, 803, 804, 806, 807, 829,
  841, 845, 850, 854, 857, 870, 877, 880, 888, 890, 893, 905, 909, 918, 933, 950,
  951, 960, 962, 984, 988, 1003, 1015, 1022, 1043, 1048, 1049, 1052, 1059, 1075,
  1096, 1101, 1103, 1108, 1118, 1132, 1139, 1142, 1152, 1163, 1197, 1202, 1210,
  1222, 1228, 1235, 1250, 1284, 1287, 1310, 1342, 1358, 1362, 1369, 1370, 1374,
  1377, 1407, 1417, 1419, 1429, 1459, 1461, 1475, 1487, 1495, 1507, 1516, 1517,
  1522, 1537, 1540, 1547, 1548, 1557, 1564, 1578, 1594, 1601, 1603, 1604, 1612,
  1617, 1634, 1636, 1651, 1655, 1672, 1681, 1700, 1702, 1716, 1756, 1766, 1782,
  1791, 1795, 1799, 1804, 1807, 1814, 1824, 1830, 1841, 1864, 1868, 1874, 1917,
  1931, 1942, 1947, 1968, 1978, 1987, 1988, 1993, 2010, 2041, 2043, 2058, 2064,
  2081, 2084, 2093, 2128, 2131, 2137, 2146, 2165, 2183, 2185, 2198, 2201, 2207,
  2210, 2239, 2240, 2242, 2258, 2260, 2276, 2278, 2281, 2289, 2294, 2295, 2317,
  2325, 2346, 2356, 2397, 2402, 2421, 2446, 2454, 2460, 2464, 2466, 2470, 2480,
  2489, 2497, 2526, 2528, 2536, 2537, 2548, 2558, 2563, 2574, 2585, 2596, 2597,
  2599, 2610, 2614, 2620, 2634, 2635, 2645, 2660, 2667, 2682, 2689, 2694, 2722,
  2729, 2730, 2754, 2756, 2763, 2781, 2785, 2789, 2825, 2835, 2842, 2844, 2858,
  2862, 2867, 2876, 2891, 2901, 2935, 2958, 2970, 2985, 2987, 2992, 2999, 3022,
  3035, 3056, 3073, 3083, 3096, 3101, 3117, 3134, 3144, 3146, 3159, 3166, 3169,
  3176, 3189, 3199, 3205, 3206, 3211, 3219, 3221, 3222, 3227, 3258, 3263, 3266,
  3267, 3268, 3271, 3279, 3284, 3288, 3294, 3295, 3298, 3311, 3319, 3329, 3332,
];

// ABI
const ERC721_ABI = [
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// MONAD CHAIN
const monadChain = defineChain({
  id: 10143,
  name: 'Monad',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [config.MONAD_RPC] } },
  contracts: {
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
    },
  },
});

// CLIENTS
const monad = createPublicClient({
  chain: monadChain,
  transport: http(),
});

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

let db: Database.Database;

// =============================================================================
// TYPES
// =============================================================================

interface DiscordConnection {
  wallet_address: string;
  platform_user_id: string;
  username: string;
}

interface PendingVerification {
  discordUserId: string;
  discordUsername: string;
  walletAddress: string;
  startedAt: number;
  expectedAmount: string;
}

// Store pending verifications in memory
const pendingVerifications = new Map<string, PendingVerification>();

// =============================================================================
// DATABASE FUNCTIONS
// =============================================================================

function initializeWalletVerificationTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS wallet_verifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_user_id TEXT NOT NULL,
      discord_username TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      verification_amount TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'expired', 'cancelled')),
      tx_hash TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      confirmed_at DATETIME
    )
  `);
  
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_wallet_verifications_user ON wallet_verifications(discord_user_id, status);
    CREATE INDEX IF NOT EXISTS idx_wallet_verifications_wallet ON wallet_verifications(wallet_address, status);
  `);
}

function getDiscordConnections(): DiscordConnection[] {
  const stmt = db.prepare(
    `SELECT wallet_address, platform_user_id, username
     FROM social_connections
     WHERE platform = 'discord'`
  );
  return stmt.all() as DiscordConnection[];
}

function getConnectionByDiscordId(discordUserId: string): DiscordConnection | null {
  const stmt = db.prepare(`
    SELECT wallet_address, platform_user_id, username
    FROM social_connections
    WHERE platform = 'discord' AND platform_user_id = ?
  `);
  return (stmt.get(discordUserId) as DiscordConnection) || null;
}

function isWalletAlreadyLinked(walletAddress: string): DiscordConnection | null {
  const stmt = db.prepare(`
    SELECT wallet_address, platform_user_id, username
    FROM social_connections
    WHERE platform = 'discord' AND LOWER(wallet_address) = LOWER(?)
  `);
  return (stmt.get(walletAddress) as DiscordConnection) || null;
}

function saveDiscordConnection(
  walletAddress: string,
  discordUserId: string,
  discordUsername: string
): void {
  const stmt = db.prepare(`
    INSERT INTO social_connections (
      wallet_address, platform, platform_user_id, username
    )
    VALUES (?, 'discord', ?, ?)
    ON CONFLICT(wallet_address, platform) DO UPDATE SET
      platform_user_id = excluded.platform_user_id,
      username = excluded.username,
      updated_at = CURRENT_TIMESTAMP
  `);
  stmt.run(walletAddress.toLowerCase(), discordUserId, discordUsername);
}

function recordPendingVerification(
  discordUserId: string,
  discordUsername: string,
  walletAddress: string,
  verificationAmount: string
): void {
  db.prepare(`
    UPDATE wallet_verifications
    SET status = 'cancelled'
    WHERE discord_user_id = ? AND status = 'pending'
  `).run(discordUserId);
  
  db.prepare(`
    INSERT INTO wallet_verifications (
      discord_user_id, discord_username, wallet_address, verification_amount
    )
    VALUES (?, ?, ?, ?)
  `).run(discordUserId, discordUsername, walletAddress.toLowerCase(), verificationAmount);
}

function confirmVerification(
  discordUserId: string,
  walletAddress: string,
  txHash: string
): void {
  db.prepare(`
    UPDATE wallet_verifications
    SET status = 'confirmed', tx_hash = ?, confirmed_at = CURRENT_TIMESTAMP
    WHERE discord_user_id = ? AND LOWER(wallet_address) = LOWER(?) AND status = 'pending'
  `).run(txHash, discordUserId, walletAddress);
}

function removeDiscordConnection(discordUserId: string): boolean {
  const result = db.prepare(`
    DELETE FROM social_connections
    WHERE platform = 'discord' AND platform_user_id = ?
  `).run(discordUserId);
  return result.changes > 0;
}

// =============================================================================
// BLOCKCHAIN FUNCTIONS
// =============================================================================

function getTier(stars: number) {
  return TIERS.find(t => stars >= t.min) || null;
}

async function countStars(wallet: string): Promise<number> {
  const results = await monad.multicall({
    contracts: STAR_SKRUMPEY_IDS.map(id => ({
      address: config.SKRUMPEY_CONTRACT,
      abi: ERC721_ABI,
      functionName: 'ownerOf',
      args: [BigInt(id)],
    })),
  });

  return results.filter(
    r =>
      r.status === 'success' &&
      (r.result as string).toLowerCase() === wallet.toLowerCase()
  ).length;
}

/**
 * Check for incoming MON transfer from a specific wallet to verification address.
 * 
 * Security: This function checks that:
 * 1. Transaction is FROM the claimed wallet address
 * 2. Transaction is TO the verification address
 * 3. Transaction amount >= expected amount
 * 4. Transaction occurred AFTER the verification was initiated (sinceTimestamp)
 * 
 * The block lookback (100 blocks) can be adjusted based on network conditions.
 */
async function checkForVerificationTransaction(
  fromAddress: string,
  expectedAmountMON: string,
  sinceTimestamp: number
): Promise<{ found: boolean; txHash?: string }> {
  try {
    const currentBlock = await monad.getBlockNumber();
    const expectedAmountWei = parseEther(expectedAmountMON);
    
    // Check last 100 blocks (adjust based on network block time)
    const BLOCK_LOOKBACK = 100;
    
    for (let i = 0; i < BLOCK_LOOKBACK; i++) {
      const blockNumber = currentBlock - BigInt(i);
      try {
        const block = await monad.getBlock({
          blockNumber,
          includeTransactions: true,
        });
        
        // Convert block timestamp to milliseconds for comparison
        const blockTimestamp = Number(block.timestamp) * 1000;
        
        // Skip blocks that are older than when verification was initiated
        // This prevents using old transactions for verification
        if (blockTimestamp < sinceTimestamp) {
          break;
        }
        
        for (const tx of block.transactions) {
          if (typeof tx === 'object' && 
              tx.from.toLowerCase() === fromAddress.toLowerCase() &&
              tx.to?.toLowerCase() === config.VERIFICATION_ADDRESS.toLowerCase() &&
              tx.value >= expectedAmountWei) {
            return { found: true, txHash: tx.hash };
          }
        }
      } catch (blockError) {
        // Block retrieval may fail for various reasons (not yet indexed, network issues)
        // Continue to next block - this is expected behavior
        continue;
      }
    }
    
    return { found: false };
  } catch (error) {
    console.error('Error checking for verification transaction:', error);
    return { found: false };
  }
}

// =============================================================================
// SYNC FUNCTIONS
// =============================================================================

async function syncUser(discordId: string, wallet: string, username: string) {
  const guild = await client.guilds.fetch(config.DISCORD_GUILD_ID);
  const member = await guild.members.fetch(discordId).catch(() => null);
  if (!member) return;

  const stars = await countStars(wallet);
  const tier = getTier(stars);

  const current = ALL_TIER_ROLE_IDS.filter(r => member.roles.cache.has(r));

  if (!tier) {
    if (current.length) {
      await member.roles.remove(current);
      console.log(`❌ Removed roles from ${username} - no longer a holder`);
    }
    return;
  }

  if (!member.roles.cache.has(tier.roleId)) {
    if (current.length) await member.roles.remove(current);
    await member.roles.add(tier.roleId);
    console.log(`${tier.emoji} ${username} → ${tier.name} (${stars} Stars)`);
  }
}

async function syncAll() {
  console.log('\n🔄 Sync starting at', new Date().toISOString());
  const connections = getDiscordConnections();
  console.log(`📊 Found ${connections.length} Discord-connected wallets\n`);

  for (const c of connections) {
    await syncUser(c.platform_user_id, c.wallet_address, c.username);
    await new Promise(r => setTimeout(r, 400));
  }
  console.log('✅ Sync complete\n');
}

// =============================================================================
// COMMAND HANDLERS
// =============================================================================

async function handleLinkCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const walletAddress = interaction.options.getString('wallet', true);
  
  if (!isAddress(walletAddress)) {
    await interaction.reply({
      content: '❌ **Invalid Wallet Address**\n\nPlease provide a valid wallet address starting with `0x`.',
      ephemeral: true,
    });
    return;
  }
  
  const existingConnection = getConnectionByDiscordId(interaction.user.id);
  if (existingConnection) {
    await interaction.reply({
      content: `⚠️ **Wallet Already Linked**\n\nYou already have a wallet linked:\n\`${existingConnection.wallet_address}\`\n\nUse \`/unlink\` first if you want to link a different wallet.`,
      ephemeral: true,
    });
    return;
  }
  
  const walletLinked = isWalletAlreadyLinked(walletAddress);
  if (walletLinked) {
    await interaction.reply({
      content: '❌ **Wallet Already Linked**\n\nThis wallet is already linked to another Discord account.',
      ephemeral: true,
    });
    return;
  }
  
  if (!config.VERIFICATION_ADDRESS) {
    await interaction.reply({
      content: '❌ **Configuration Error**\n\nWallet verification is not configured. Please contact an admin.',
      ephemeral: true,
    });
    return;
  }
  
  const verification: PendingVerification = {
    discordUserId: interaction.user.id,
    discordUsername: interaction.user.username,
    walletAddress: walletAddress.toLowerCase(),
    startedAt: Date.now(),
    expectedAmount: config.VERIFICATION_AMOUNT,
  };
  pendingVerifications.set(interaction.user.id, verification);
  
  recordPendingVerification(
    interaction.user.id,
    interaction.user.username,
    walletAddress,
    config.VERIFICATION_AMOUNT
  );
  
  const walletShort = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
  
  const embed = new EmbedBuilder()
    .setColor(0x00BFFF)
    .setTitle('🔗 Wallet Verification')
    .setDescription(`To verify ownership of wallet \`${walletShort}\`, please send **${config.VERIFICATION_AMOUNT} MON** to the verification address.`)
    .addFields(
      { name: '📤 Send From', value: `\`${walletAddress}\``, inline: false },
      { name: '📥 Send To', value: `\`${config.VERIFICATION_ADDRESS}\``, inline: false },
      { name: '💰 Amount', value: `\`${config.VERIFICATION_AMOUNT} MON\``, inline: true },
      { name: '⏱️ Time Limit', value: '10 minutes', inline: true }
    )
    .setFooter({ text: 'Click "Verify Transaction" after sending' })
    .setTimestamp();
  
  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('check_verification')
        .setLabel('Verify Transaction')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId('cancel_verification')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('❌')
    );
  
  await interaction.reply({ 
    embeds: [embed], 
    components: [row],
    ephemeral: true,
  });
  
  // Clean up pending verification after timeout
  // Note: The timer fires regardless of whether verification completed/cancelled
  // This is intentional to prevent memory leaks from abandoned verifications
  setTimeout(() => {
    pendingVerifications.delete(interaction.user.id);
  }, 10 * 60 * 1000);
}

async function handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
  if (interaction.customId === 'cancel_verification') {
    pendingVerifications.delete(interaction.user.id);
    
    const embed = new EmbedBuilder()
      .setColor(0xFFAA00)
      .setTitle('❌ Verification Cancelled')
      .setDescription('Wallet verification has been cancelled.')
      .setTimestamp();
    
    await interaction.update({ embeds: [embed], components: [] });
    return;
  }
  
  if (interaction.customId === 'check_verification') {
    await interaction.deferUpdate();
    
    const pending = pendingVerifications.get(interaction.user.id);
    if (!pending) {
      const embed = new EmbedBuilder()
        .setColor(0xFF6B6B)
        .setTitle('❌ Verification Expired')
        .setDescription('This verification session has expired. Please use `/link` again.')
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed], components: [] });
      return;
    }
    
    const { found, txHash } = await checkForVerificationTransaction(
      pending.walletAddress,
      pending.expectedAmount,
      pending.startedAt
    );
    
    if (found && txHash) {
      pendingVerifications.delete(interaction.user.id);
      
      saveDiscordConnection(
        pending.walletAddress,
        pending.discordUserId,
        pending.discordUsername
      );
      
      confirmVerification(
        pending.discordUserId,
        pending.walletAddress,
        txHash
      );
      
      const stars = await countStars(pending.walletAddress);
      const tier = getTier(stars);
      
      await syncUser(pending.discordUserId, pending.walletAddress, pending.discordUsername);
      
      const walletShort = `${pending.walletAddress.slice(0, 6)}...${pending.walletAddress.slice(-4)}`;
      const txShort = `${txHash.slice(0, 10)}...${txHash.slice(-8)}`;
      
      const embed = new EmbedBuilder()
        .setColor(0x00FF88)
        .setTitle('✅ Wallet Verified!')
        .setDescription('Your wallet has been successfully linked to your Discord account.')
        .addFields(
          { name: '💎 Wallet', value: `\`${walletShort}\``, inline: false },
          { name: '⭐ Stars Owned', value: String(stars), inline: true },
          { name: '🏆 Tier', value: tier ? `${tier.emoji} ${tier.name}` : 'None (need 1+ Stars)', inline: true },
          { name: '📜 Transaction', value: `\`${txShort}\``, inline: false }
        )
        .setFooter({ text: 'Your roles will update automatically every 5 minutes' })
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed], components: [] });
    } else {
      const walletShort = `${pending.walletAddress.slice(0, 6)}...${pending.walletAddress.slice(-4)}`;
      
      const embed = new EmbedBuilder()
        .setColor(0xFFAA00)
        .setTitle('⏳ Transaction Not Found')
        .setDescription(`No matching transaction found yet.\n\nMake sure you:\n• Send from: \`${walletShort}\`\n• Send to: \`${config.VERIFICATION_ADDRESS}\`\n• Amount: **${pending.expectedAmount} MON** or more\n\nClick "Verify Transaction" again after sending.`)
        .setTimestamp();
      
      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('check_verification')
            .setLabel('Verify Transaction')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('✅'),
          new ButtonBuilder()
            .setCustomId('cancel_verification')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('❌')
        );
      
      await interaction.editReply({ embeds: [embed], components: [row] });
    }
  }
}

async function handleUnlinkCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const connection = getConnectionByDiscordId(interaction.user.id);
  
  if (!connection) {
    await interaction.reply({
      content: '⚠️ **No Wallet Linked**\n\nYou don\'t have a wallet linked to your Discord account.',
      ephemeral: true,
    });
    return;
  }
  
  const removed = removeDiscordConnection(interaction.user.id);
  
  if (removed) {
    const guild = await client.guilds.fetch(config.DISCORD_GUILD_ID);
    const member = await guild.members.fetch(interaction.user.id).catch(() => null);
    
    if (member) {
      const current = ALL_TIER_ROLE_IDS.filter(r => member.roles.cache.has(r));
      if (current.length) {
        await member.roles.remove(current);
      }
    }
    
    const walletShort = `${connection.wallet_address.slice(0, 6)}...${connection.wallet_address.slice(-4)}`;
    
    await interaction.reply({
      content: `✅ **Wallet Unlinked**\n\nYour wallet \`${walletShort}\` has been unlinked and holder roles removed.`,
      ephemeral: true,
    });
  } else {
    await interaction.reply({
      content: '❌ **Error**\n\nFailed to unlink wallet. Please try again or contact an admin.',
      ephemeral: true,
    });
  }
}

// =============================================================================
// EVENT HANDLERS
// =============================================================================

client.on('ready', async () => {
  console.log(`\n🤖 Logged in as ${client.user?.tag}`);
  console.log(`📅 ${new Date().toISOString()}\n`);

  try {
    db = new Database(config.DB_PATH);
    console.log(`📊 Connected to database: ${config.DB_PATH}`);
    
    // Initialize verification table
    initializeWalletVerificationTable();
    console.log('📋 Wallet verification table ready');
  } catch (error) {
    console.error('❌ Failed to connect to database:', error);
    process.exit(1);
  }

  const rest = new REST({ version: '10' }).setToken(config.DISCORD_BOT_TOKEN);

  try {
    console.log('📝 Registering slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(client.user!.id, config.DISCORD_GUILD_ID),
      {
        body: [
          new SlashCommandBuilder().setName('verify').setDescription('Verify your Star Skrumpey holdings'),
          new SlashCommandBuilder().setName('status').setDescription('Check your verification status'),
          new SlashCommandBuilder().setName('tiers').setDescription('View holder tier requirements'),
          new SlashCommandBuilder()
            .setName('link')
            .setDescription('Link your wallet by sending a small MON transfer')
            .addStringOption(option =>
              option
                .setName('wallet')
                .setDescription('Your Monad wallet address (0x...)')
                .setRequired(true)
            ),
          new SlashCommandBuilder().setName('unlink').setDescription('Unlink your wallet from Discord'),
        ].map(c => c.toJSON()),
      }
    );
    console.log('✅ Slash commands registered\n');
  } catch (error) {
    console.error('Failed to register commands:', error);
  }

  // Log verification config
  if (config.VERIFICATION_ADDRESS) {
    console.log(`🔗 Wallet verification enabled`);
    console.log(`   Address: ${config.VERIFICATION_ADDRESS}`);
    console.log(`   Amount: ${config.VERIFICATION_AMOUNT} MON\n`);
  } else {
    console.log('⚠️ Wallet verification NOT configured (VERIFICATION_ADDRESS missing)\n');
  }

  await syncAll();

  setInterval(syncAll, config.SYNC_INTERVAL_MS);
  console.log(`⏰ Scheduled sync every ${config.SYNC_INTERVAL_MS / 1000 / 60} minutes\n`);
});

client.on('interactionCreate', async (interaction) => {
  // Handle button interactions
  if (interaction.isButton()) {
    await handleButtonInteraction(interaction);
    return;
  }
  
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'tiers') {
    await interaction.reply({
      content: `🏆 **Star World Order Holder Tiers**\n\n👑 **COSMIC EMPEROR** - 10+ Stars\n⚔️ **STAR LORD** - 5-9 Stars\n🛡️ **COSMIC WARDEN** - 2-4 Stars\n⭐ **STAR FORGED** - 1 Star\n\n🔗 Connect at: https://starworldorder.com/profile\n📲 Or use: \`/link <wallet>\``,
    });
    return;
  }

  if (interaction.commandName === 'verify' || interaction.commandName === 'status') {
    await interaction.deferReply({ ephemeral: true });

    const discordId = interaction.user.id;
    const connection = getConnectionByDiscordId(discordId);

    if (!connection) {
      await interaction.editReply({
        content: '❌ **No wallet connected!**\n\nUse `/link <wallet>` to verify via MON transfer, or connect at: https://starworldorder.com/profile',
      });
      return;
    }

    const stars = await countStars(connection.wallet_address);
    const tier = getTier(stars);

    if (interaction.commandName === 'verify' && tier) {
      await syncUser(discordId, connection.wallet_address, connection.username);
    }

    const walletShort = `${connection.wallet_address.slice(0, 6)}...${connection.wallet_address.slice(-4)}`;

    await interaction.editReply({
      content: tier
        ? `${tier.emoji} **Verified ${tier.name}!**\n\n💼 Wallet: \`${walletShort}\`\n⭐ Stars: **${stars}**`
        : `❌ **Not a Star Holder**\n\n💼 Wallet: \`${walletShort}\`\n⭐ Stars: **0**\n\n🛒 Get yours: https://magiceden.io/collections/monad/skrumpeys`,
    });
    return;
  }

  if (interaction.commandName === 'link') {
    await handleLinkCommand(interaction);
    return;
  }

  if (interaction.commandName === 'unlink') {
    await handleUnlinkCommand(interaction);
    return;
  }
});

// Error handling
client.on('error', console.error);
process.on('unhandledRejection', console.error);

// START
console.log('🚀 Starting SWO Discord Bot v2.0...\n');
client.login(config.DISCORD_BOT_TOKEN);
```

---

## Step 9: Update .env.bot

Add these new environment variables to your `.env.bot` file:

```bash
# Existing variables...
DISCORD_BOT_TOKEN=your-token
DISCORD_GUILD_ID=your-guild-id
COSMIC_EMPEROR_ROLE_ID=...
STAR_LORD_ROLE_ID=...
COSMIC_WARDEN_ROLE_ID=...
STAR_FORGED_ROLE_ID=...
DB_PATH=/opt/swo/data/swo.db
MONAD_RPC=https://testnet-rpc.monad.xyz

# NEW: Add these for wallet verification
DISCORD_CLIENT_ID=your-discord-client-id
VERIFICATION_ADDRESS=0xYourVerificationAddress
VERIFICATION_AMOUNT=1
```

---

## Step 10: Deploy

1. **Stop the bot:**
   ```bash
   pm2 stop swo-bot
   ```

2. **Backup current file:**
   ```bash
   cp /opt/star_world_order/SWO_bot/index.ts /opt/star_world_order/SWO_bot/index.ts.backup
   ```

3. **Replace index.ts** with the new version

4. **Update .env.bot** with the new variables

5. **Install any missing dependencies** (if needed):
   ```bash
   cd /opt/star_world_order/SWO_bot
   npm install
   ```

6. **Compile TypeScript:**
   ```bash
   npx tsc
   ```

7. **Start the bot:**
   ```bash
   pm2 start swo-bot
   ```

8. **Check logs:**
   ```bash
   pm2 logs swo-bot
   ```

---

## How Role Sync Works with /link

When a user verifies via `/link`:

1. **Immediate**: Their Discord-wallet connection is saved to `social_connections` table
2. **Immediate**: Their roles are updated based on Star count
3. **Every 5 minutes**: Sync runs and checks ALL connected wallets
4. **If they sell Stars**: Next sync removes their holder role
5. **If they buy more Stars**: Next sync upgrades their tier role

The sync handles role removal automatically - no separate "remove role" logic needed!

---

## Testing

1. Run `/link 0xYourTestWallet` in Discord
2. You should see the verification embed with instructions
3. Send 1 MON from the specified wallet to the verification address
4. Click "Verify Transaction" button
5. If successful, you'll see the confirmation and get your role

---

## Troubleshooting

### Transaction Not Found
- Ensure you're sending from the exact wallet specified
- Ensure you're sending TO the verification address (not from it)
- Wait for the transaction to be mined (check on explorer)
- The transaction must be within the last 100 blocks

### Role Not Updated
- Check bot has "Manage Roles" permission
- Check bot's role is higher than holder roles in Discord settings
- Check the role IDs in .env.bot are correct

### Database Errors
- Ensure the bot has write access to the database path
- Check the database isn't locked by another process

/**
 * QUESTS AND XP SYSTEM — db helpers. Extracted from the lib/db.ts god-file.
 * Handle via ./connection.
 */
import { getDatabase } from './connection';


export interface Quest {
  id: string;
  name: string;
  description: string;
  xp_reward: number;
  quest_type: 'daily' | 'weekly' | 'one_time' | 'urgent';
  category: 'social' | 'trading' | 'governance' | 'community' | 'general';
  requirements_json: string | null;
  is_active: number;
  priority: number;
  icon: string;
  created_at: string;
  expires_at: string | null;
}

export interface UserQuest {
  id: number;
  wallet_address: string;
  quest_id: string;
  status: 'available' | 'in_progress' | 'completed' | 'claimed';
  progress: number;
  started_at: string | null;
  completed_at: string | null;
  claimed_at: string | null;
  created_at: string;
}

export interface UserXP {
  id: number;
  wallet_address: string;
  total_xp: number;
  level: number;
  created_at: string;
  updated_at: string;
}

/**
 * Calculate level from XP using a curve formula
 * Level = floor(sqrt(XP / 100)) + 1
 * This means:
 * - Level 1: 0-99 XP
 * - Level 2: 100-399 XP
 * - Level 3: 400-899 XP
 * - Level 4: 900-1599 XP
 * - etc.
 */
export function calculateLevelFromXP(xp: number): number {
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

/**
 * Calculate XP required for a given level
 */
export function getXPRequiredForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.pow(level - 1, 2) * 100;
}

/**
 * Calculate XP progress within current level
 * Returns { current, required, percentage }
 */
export function getXPProgress(totalXP: number): {
  currentLevelXP: number;
  requiredForNextLevel: number;
  percentage: number;
  level: number;
} {
  const level = calculateLevelFromXP(totalXP);
  const xpForCurrentLevel = getXPRequiredForLevel(level);
  const xpForNextLevel = getXPRequiredForLevel(level + 1);
  const currentLevelXP = totalXP - xpForCurrentLevel;
  const requiredForNextLevel = xpForNextLevel - xpForCurrentLevel;
  const percentage = Math.min(100, (currentLevelXP / requiredForNextLevel) * 100);

  return {
    currentLevelXP,
    requiredForNextLevel,
    percentage,
    level,
  };
}

/**
 * Get all active quests
 */
export function getActiveQuests(): Quest[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM quests 
    WHERE is_active = 1
    AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
    ORDER BY priority DESC, created_at ASC
  `);
  return stmt.all() as Quest[];
}

/**
 * Get quests by type
 */
export function getQuestsByType(questType: Quest['quest_type']): Quest[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM quests 
    WHERE quest_type = ? AND is_active = 1
    AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
    ORDER BY priority DESC, created_at ASC
  `);
  return stmt.all(questType) as Quest[];
}

/**
 * Get urgent quests (highest priority, time-sensitive)
 */
export function getUrgentQuests(): Quest[] {
  return getQuestsByType('urgent');
}

/**
 * Get a single quest by ID
 */
export function getQuestById(questId: string): Quest | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM quests WHERE id = ?');
  return stmt.get(questId) as Quest | null;
}

/**
 * Get user's XP data (creates record if not exists)
 */
export function getUserXP(walletAddress: string): UserXP {
  const db = getDatabase();
  const normalizedAddress = walletAddress.toLowerCase();
  
  let userXP = db.prepare('SELECT * FROM user_xp WHERE wallet_address = ?')
    .get(normalizedAddress) as UserXP | undefined;
  
  if (!userXP) {
    // Create new user XP record
    db.prepare(`
      INSERT INTO user_xp (wallet_address, total_xp, level)
      VALUES (?, 0, 1)
    `).run(normalizedAddress);
    
    userXP = db.prepare('SELECT * FROM user_xp WHERE wallet_address = ?')
      .get(normalizedAddress) as UserXP;
  }
  
  return userXP;
}

/**
 * Add XP to a user (automatically updates level)
 */
export function addUserXP(walletAddress: string, xpAmount: number): UserXP {
  const db = getDatabase();
  const normalizedAddress = walletAddress.toLowerCase();
  
  // Ensure user exists
  const userXP = getUserXP(normalizedAddress);
  
  // Calculate new XP and level
  const newTotalXP = userXP.total_xp + xpAmount;
  const newLevel = calculateLevelFromXP(newTotalXP);
  
  // Update user XP
  db.prepare(`
    UPDATE user_xp 
    SET total_xp = ?, level = ?, updated_at = CURRENT_TIMESTAMP
    WHERE wallet_address = ?
  `).run(newTotalXP, newLevel, normalizedAddress);
  
  return getUserXP(normalizedAddress);
}

/**
 * Get user's quest progress
 */
export function getUserQuestProgress(walletAddress: string, questId: string): UserQuest | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM user_quests 
    WHERE wallet_address = ? AND quest_id = ?
  `);
  return stmt.get(walletAddress.toLowerCase(), questId) as UserQuest | null;
}

/**
 * Get all quest progress for a user
 */
export function getUserQuests(walletAddress: string): UserQuest[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM user_quests 
    WHERE wallet_address = ?
    ORDER BY created_at DESC
  `);
  return stmt.all(walletAddress.toLowerCase()) as UserQuest[];
}

/**
 * Start a quest for a user
 */
export function startQuest(walletAddress: string, questId: string): UserQuest {
  const db = getDatabase();
  const normalizedAddress = walletAddress.toLowerCase();
  
  // Check if already exists
  const existing = getUserQuestProgress(normalizedAddress, questId);
  if (existing) {
    return existing;
  }
  
  // Create new quest progress
  db.prepare(`
    INSERT INTO user_quests (wallet_address, quest_id, status, started_at)
    VALUES (?, ?, 'in_progress', CURRENT_TIMESTAMP)
  `).run(normalizedAddress, questId);
  
  return getUserQuestProgress(normalizedAddress, questId)!;
}

/**
 * Update quest progress
 */
export function updateQuestProgress(
  walletAddress: string, 
  questId: string, 
  progress: number
): UserQuest | null {
  const db = getDatabase();
  const normalizedAddress = walletAddress.toLowerCase();
  
  db.prepare(`
    UPDATE user_quests 
    SET progress = ?, updated_at = CURRENT_TIMESTAMP
    WHERE wallet_address = ? AND quest_id = ?
  `).run(progress, normalizedAddress, questId);
  
  return getUserQuestProgress(normalizedAddress, questId);
}

/**
 * Complete a quest for a user
 */
export function completeQuest(walletAddress: string, questId: string): UserQuest | null {
  const db = getDatabase();
  const normalizedAddress = walletAddress.toLowerCase();
  
  // Check if quest exists and is not already completed
  const existing = getUserQuestProgress(normalizedAddress, questId);
  
  if (existing && (existing.status === 'completed' || existing.status === 'claimed')) {
    return existing; // Already completed
  }
  
  if (!existing) {
    // Create and complete in one step
    db.prepare(`
      INSERT INTO user_quests (wallet_address, quest_id, status, progress, started_at, completed_at)
      VALUES (?, ?, 'completed', 100, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(normalizedAddress, questId);
  } else {
    // Update existing record
    db.prepare(`
      UPDATE user_quests 
      SET status = 'completed', progress = 100, completed_at = CURRENT_TIMESTAMP
      WHERE wallet_address = ? AND quest_id = ?
    `).run(normalizedAddress, questId);
  }
  
  return getUserQuestProgress(normalizedAddress, questId);
}

/**
 * Claim quest rewards (XP)
 * Returns the XP amount claimed, or 0 if already claimed
 */
export function claimQuestReward(walletAddress: string, questId: string): {
  success: boolean;
  xpClaimed: number;
  error?: string;
} {
  const db = getDatabase();
  const normalizedAddress = walletAddress.toLowerCase();
  
  // Get quest details
  const quest = getQuestById(questId);
  if (!quest) {
    return { success: false, xpClaimed: 0, error: 'Quest not found' };
  }
  
  // Get user progress
  const progress = getUserQuestProgress(normalizedAddress, questId);
  if (!progress) {
    return { success: false, xpClaimed: 0, error: 'Quest not started' };
  }
  
  if (progress.status !== 'completed') {
    return { success: false, xpClaimed: 0, error: 'Quest not completed' };
  }
  
  // Mark as claimed
  db.prepare(`
    UPDATE user_quests 
    SET status = 'claimed', claimed_at = CURRENT_TIMESTAMP
    WHERE wallet_address = ? AND quest_id = ?
  `).run(normalizedAddress, questId);
  
  // Add XP to user
  addUserXP(normalizedAddress, quest.xp_reward);
  
  return { success: true, xpClaimed: quest.xp_reward };
}

/**
 * Get quests with user progress for display
 */
export function getQuestsWithProgress(walletAddress: string): Array<Quest & { 
  userProgress: UserQuest | null;
  canClaim: boolean;
}> {
  const quests = getActiveQuests();
  const userQuests = getUserQuests(walletAddress);
  
  const userQuestMap = new Map<string, UserQuest>();
  for (const uq of userQuests) {
    userQuestMap.set(uq.quest_id, uq);
  }
  
  return quests.map(quest => {
    const userProgress = userQuestMap.get(quest.id) || null;
    const canClaim = userProgress?.status === 'completed';
    return { ...quest, userProgress, canClaim };
  });
}

/**
 * Get XP leaderboard
 */
export function getXPLeaderboard(limit: number = 10): Array<UserXP & { rank: number }> {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT *, ROW_NUMBER() OVER (ORDER BY total_xp DESC) as rank
    FROM user_xp
    ORDER BY total_xp DESC
    LIMIT ?
  `);
  return stmt.all(limit) as Array<UserXP & { rank: number }>;
}

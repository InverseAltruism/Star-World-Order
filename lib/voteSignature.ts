/**
 * Vote Signature Verification
 * 
 * This module provides cryptographic vote verification using EIP-191 message signing.
 * 
 * SECURITY NOTES:
 * - Message signing (personal_sign / EIP-191) is COMPLETELY SAFE for users
 * - It CANNOT move assets, interact with contracts, or spend tokens
 * - It only proves wallet ownership - like signing your name on paper
 * - This is the same method used by Snapshot, OpenSea, and all major Web3 apps
 * 
 * How it works:
 * 1. User votes on a proposal
 * 2. We construct a human-readable message with the vote details
 * 3. User signs this message with their wallet (MetaMask shows "Sign Message")
 * 4. Signature is stored alongside the vote in the database
 * 5. Anyone can verify the signature proves the user cast that vote
 * 
 * @see https://eips.ethereum.org/EIPS/eip-191
 */

import { verifyMessage, hashMessage, recoverMessageAddress } from 'viem';

// Domain identifier to prevent cross-site signature reuse
const DOMAIN = 'starworldorder.com';
const APP_NAME = 'Star World Order DAO';
const VERSION = '1';

/**
 * Configuration constants for vote signatures
 * These can be adjusted based on network conditions and UX requirements
 */
export const VOTE_SIGNATURE_CONFIG = {
  /** Maximum age (in minutes) for a signature to be considered valid for submission */
  SIGNATURE_MAX_AGE_MINUTES: 10,
  /** Domain for signature validation (prevents cross-site reuse) */
  DOMAIN,
  /** Application name shown in signature message */
  APP_NAME,
  /** Protocol version */
  VERSION,
};

/**
 * Vote support values
 */
export type VoteChoice = 'yes' | 'no' | 'abstain';

/**
 * Vote signature data stored in database
 */
export interface VoteSignatureData {
  message: string;
  signature: string;
  timestamp: number;
  nonce: string;
}

/**
 * Generate a unique nonce for replay attack prevention
 */
export function generateNonce(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Convert vote choice to human-readable string
 */
function voteChoiceToString(choice: VoteChoice | number): string {
  if (typeof choice === 'number') {
    return choice === 1 ? 'YES' : choice === 0 ? 'NO' : 'ABSTAIN';
  }
  return choice.toUpperCase();
}

/**
 * Convert vote choice to number
 */
export function voteChoiceToNumber(choice: VoteChoice | number): number {
  if (typeof choice === 'number') return choice;
  return choice === 'yes' ? 1 : choice === 'no' ? 0 : 2;
}

/**
 * Construct the message to be signed for a vote
 * 
 * The message is human-readable and clearly shows:
 * - This is a MESSAGE signature (not a transaction)
 * - The exact vote being cast
 * - The proposal ID
 * - A timestamp and nonce for uniqueness
 * 
 * @param proposalId - The ID of the proposal being voted on
 * @param choice - The vote choice (yes/no/abstain)
 * @param timestamp - Unix timestamp when vote was cast
 * @param nonce - Unique nonce to prevent replay attacks
 * @param proposalTitle - Optional title for better UX
 */
export function constructVoteMessage(
  proposalId: string,
  choice: VoteChoice | number,
  timestamp: number,
  nonce: string,
  proposalTitle?: string
): string {
  const choiceStr = voteChoiceToString(choice);
  const date = new Date(timestamp).toISOString();
  const { APP_NAME, DOMAIN, VERSION } = VOTE_SIGNATURE_CONFIG;
  
  // Human-readable message that users can understand
  return [
    `=== ${APP_NAME} Vote Signature ===`,
    ``,
    `This is a MESSAGE signature, NOT a transaction.`,
    `Your assets are completely safe.`,
    ``,
    `Domain: ${DOMAIN}`,
    `Version: ${VERSION}`,
    ``,
    `I am casting my vote:`,
    ``,
    `  Vote: ${choiceStr}`,
    `  Proposal: ${proposalId}`,
    proposalTitle ? `  Title: ${proposalTitle}` : null,
    ``,
    `  Timestamp: ${date}`,
    `  Nonce: ${nonce}`,
    ``,
    `This signature proves I cast this vote.`,
    `It cannot be used to move assets or make transactions.`,
  ].filter(Boolean).join('\n');
}

/**
 * Parse a vote message to extract vote details
 * Returns null if message format is invalid
 */
export function parseVoteMessage(message: string): {
  choice: VoteChoice;
  proposalId: string;
  timestamp: number;
  nonce: string;
} | null {
  try {
    // Extract vote choice
    const voteMatch = message.match(/Vote: (YES|NO|ABSTAIN)/);
    if (!voteMatch) return null;
    const choice = voteMatch[1].toLowerCase() as VoteChoice;
    
    // Extract proposal ID
    const proposalMatch = message.match(/Proposal: ([^\n]+)/);
    if (!proposalMatch) return null;
    const proposalId = proposalMatch[1].trim();
    
    // Extract timestamp
    const timestampMatch = message.match(/Timestamp: ([^\n]+)/);
    if (!timestampMatch) return null;
    const timestamp = new Date(timestampMatch[1].trim()).getTime();
    
    // Extract nonce
    const nonceMatch = message.match(/Nonce: ([^\n]+)/);
    if (!nonceMatch) return null;
    const nonce = nonceMatch[1].trim();
    
    return { choice, proposalId, timestamp, nonce };
  } catch {
    return null;
  }
}

/**
 * Verify a vote signature
 * 
 * @param address - The claimed signer's address
 * @param message - The original vote message
 * @param signature - The signature to verify
 * @returns true if signature is valid and matches the address
 */
export async function verifyVoteSignature(
  address: string,
  message: string,
  signature: `0x${string}`
): Promise<boolean> {
  try {
    const isValid = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature,
    });
    return isValid;
  } catch (error) {
    console.error('Signature verification failed:', error);
    return false;
  }
}

/**
 * Recover the signer's address from a signature
 * Useful for verification without knowing the expected address
 * 
 * @param message - The original vote message
 * @param signature - The signature
 * @returns The address that signed the message
 */
export async function recoverVoteSigner(
  message: string,
  signature: `0x${string}`
): Promise<string> {
  return await recoverMessageAddress({
    message,
    signature,
  });
}

/**
 * Create a vote signature request object
 * This is what gets passed to the wallet for signing
 */
export function createVoteSignatureRequest(
  proposalId: string,
  choice: VoteChoice | number,
  proposalTitle?: string
): {
  message: string;
  timestamp: number;
  nonce: string;
} {
  const timestamp = Date.now();
  const nonce = generateNonce();
  const message = constructVoteMessage(proposalId, choice, timestamp, nonce, proposalTitle);
  
  return {
    message,
    timestamp,
    nonce,
  };
}

/**
 * Validate that a vote signature is recent (within 5 minutes)
 * Prevents using old signatures
 */
export function isSignatureRecent(timestamp: number, maxAgeMinutes: number = 5): boolean {
  const now = Date.now();
  const ageMs = now - timestamp;
  const maxAgeMs = maxAgeMinutes * 60 * 1000;
  return ageMs <= maxAgeMs;
}

/**
 * Full vote verification: checks signature AND that details match
 */
export async function verifyVote(
  voterAddress: string,
  proposalId: string,
  expectedChoice: VoteChoice | number,
  signatureData: VoteSignatureData
): Promise<{
  valid: boolean;
  error?: string;
}> {
  try {
    // 1. Verify the signature is from the claimed address
    const signatureValid = await verifyVoteSignature(
      voterAddress,
      signatureData.message,
      signatureData.signature as `0x${string}`
    );
    
    if (!signatureValid) {
      return { valid: false, error: 'Invalid signature' };
    }
    
    // 2. Parse the message to extract vote details
    const parsed = parseVoteMessage(signatureData.message);
    if (!parsed) {
      return { valid: false, error: 'Invalid message format' };
    }
    
    // 3. Verify the proposal ID matches
    if (parsed.proposalId !== proposalId) {
      return { valid: false, error: 'Proposal ID mismatch' };
    }
    
    // 4. Verify the choice matches
    const expectedChoiceNum = voteChoiceToNumber(expectedChoice);
    const parsedChoiceNum = voteChoiceToNumber(parsed.choice);
    if (expectedChoiceNum !== parsedChoiceNum) {
      return { valid: false, error: 'Vote choice mismatch' };
    }
    
    // 5. Check signature timestamp (uses configurable max age)
    if (!isSignatureRecent(parsed.timestamp, VOTE_SIGNATURE_CONFIG.SIGNATURE_MAX_AGE_MINUTES)) {
      return { valid: false, error: 'Signature expired' };
    }
    
    return { valid: true };
  } catch (error) {
    return { valid: false, error: `Verification error: ${error}` };
  }
}

/**
 * UI helper: Get user-friendly explanation of what signing means
 */
export const SIGNATURE_SAFETY_EXPLANATION = {
  short: '✅ This is a MESSAGE signature, not a transaction. Your assets are safe.',
  
  detailed: [
    '🔐 What is message signing?',
    '',
    'Message signing is like signing your name on a piece of paper.',
    'It proves you own your wallet, but it CANNOT:',
    '',
    '  ❌ Move your tokens or NFTs',
    '  ❌ Interact with smart contracts',
    '  ❌ Spend your cryptocurrency',
    '  ❌ Give anyone access to your wallet',
    '',
    '✅ It CAN only prove that you cast this specific vote.',
    '',
    'This is the same secure method used by Snapshot, OpenSea,',
    'and all major Web3 applications. Millions of users sign',
    'messages daily without any risk to their assets.',
  ].join('\n'),
  
  tooltipText: 'Message signatures only prove wallet ownership. They cannot move assets, interact with contracts, or access your funds. This is industry-standard Web3 authentication used by Snapshot, OpenSea, and more.',
};

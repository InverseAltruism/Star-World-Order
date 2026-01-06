/**
 * Vote Signature Verification
 * 
 * This module provides cryptographic vote verification using EIP-712 typed data signing.
 * EIP-191 (personal_sign) is also supported for backward compatibility with existing votes.
 * 
 * SECURITY NOTES:
 * - Message signing is COMPLETELY SAFE for users
 * - It CANNOT move assets, interact with contracts, or spend tokens
 * - It only proves wallet ownership - like signing your name on paper
 * - EIP-712 provides structured data display in wallets for better user experience
 * 
 * How it works:
 * 1. User votes on a proposal
 * 2. We construct structured typed data (EIP-712) with the vote details
 * 3. User signs this data with their wallet (MetaMask shows structured fields)
 * 4. Signature is stored alongside the vote in the database
 * 5. Anyone can verify the signature proves the user cast that vote
 * 
 * @see https://eips.ethereum.org/EIPS/eip-712
 * @see https://eips.ethereum.org/EIPS/eip-191
 */

import { 
  verifyMessage, 
  hashMessage, 
  recoverMessageAddress,
  verifyTypedData,
  hashTypedData,
  type TypedDataDomain,
} from 'viem';

// Domain identifier to prevent cross-site signature reuse
const DOMAIN = 'starworldorder.com';
const APP_NAME = 'Star World Order DAO';
const VERSION = '1';

/**
 * Get the chain ID for the current environment
 * Defaults to 143 (Monad Mainnet)
 * Can be overridden via NEXT_PUBLIC_MONAD_CHAIN_ID environment variable
 */
export function getChainId(): number {
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_MONAD_CHAIN_ID) {
    return parseInt(process.env.NEXT_PUBLIC_MONAD_CHAIN_ID, 10);
  }
  return 143; // Default to Monad Mainnet
}

/**
 * EIP-712 Domain Definition
 * Provides cryptographic domain separation enforced by the wallet
 */
export function getEIP712Domain(chainId?: number): TypedDataDomain {
  return {
    name: APP_NAME,
    version: VERSION,
    chainId: BigInt(chainId || getChainId()),
    // Sentinel address for off-chain voting (no contract deployment)
    verifyingContract: '0x0000000000000000000000000000000000000001' as `0x${string}`,
  };
}

/**
 * EIP-712 Type Definition for Vote
 */
export const EIP712_VOTE_TYPES = {
  Vote: [
    { name: 'proposalId', type: 'string' },
    { name: 'choice', type: 'uint8' },
    { name: 'voter', type: 'address' },
    { name: 'snapshotBlock', type: 'uint256' },
    { name: 'nonce', type: 'string' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

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
 * Signature version to track which format was used
 */
export type SignatureVersion = 'eip191' | 'eip712';

/**
 * Vote signature data stored in database
 */
export interface VoteSignatureData {
  message?: string; // EIP-191 only
  typedData?: any; // EIP-712 only
  signature: string;
  timestamp: number;
  nonce: string;
  version: SignatureVersion;
}

/**
 * EIP-712 Vote Data structure
 */
export interface VoteTypedData {
  proposalId: string;
  choice: number; // 0=No, 1=Yes, 2=Abstain
  voter: `0x${string}`;
  snapshotBlock: bigint;
  nonce: string;
  deadline: bigint;
}

/**
 * Valid vote choices as a const array
 */
export const VALID_CHOICES = [0, 1, 2] as const;
export type VoteChoiceNumber = typeof VALID_CHOICES[number];

/**
 * INPUT VALIDATION FUNCTIONS
 * Strict validation to prevent malformed data
 */

/**
 * Validate vote choice - only accepts 0, 1, or 2
 */
export function validateChoice(choice: unknown): choice is VoteChoiceNumber {
  return typeof choice === 'number' && VALID_CHOICES.includes(choice as any);
}

/**
 * Proposal ID regex patterns
 * Accepts: 
 * - SWO-XXX format (e.g., SWO-001, SWO-123)
 * - UUID format (e.g., 550e8400-e29b-41d4-a716-446655440000)
 * - prop-{timestamp}-{hex8} format (e.g., prop-1767737266851-6fd36731)
 *   where hex8 is an 8-character hex string from crypto.randomBytes(4)
 */
const PROPOSAL_ID_REGEX = /^(SWO-\d{3,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|prop-\d+-[0-9a-f]{8})$/i;

/**
 * Validate proposal ID format
 * Accepts SWO-XXX, UUID, or prop-{timestamp}-{hex8} format
 */
export function validateProposalId(id: unknown): boolean {
  return typeof id === 'string' && PROPOSAL_ID_REGEX.test(id);
}

/**
 * Normalize and validate Ethereum address
 * Returns lowercase address if valid, null otherwise
 */
export function normalizeAddress(address: string): string | null {
  try {
    // Check basic format: starts with 0x and has 40 hex characters
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return null;
    }
    return address.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Validate and normalize Ethereum address (throws on invalid)
 */
export function validateAddress(address: string): `0x${string}` {
  // Check basic format: starts with 0x and has 40 hex characters
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error(`Invalid Ethereum address: ${address}`);
  }
  return address.toLowerCase() as `0x${string}`;
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
 * - Snapshot block for voting power calculation
 * - Chain ID and DAO ID for cross-chain/cross-DAO protection
 * 
 * @param proposalId - The ID of the proposal being voted on
 * @param choice - The vote choice (yes/no/abstain)
 * @param nonce - Server-issued nonce to prevent replay attacks
 * @param snapshotBlock - Block number for voting power snapshot
 * @param proposalTitle - Optional title for better UX
 * @param chainId - Chain ID to prevent cross-chain replay
 * @param daoId - DAO identifier to prevent cross-DAO replay
 */
export function constructVoteMessage(
  proposalId: string,
  choice: VoteChoice | number,
  nonce: string,
  snapshotBlock: number,
  proposalTitle?: string,
  chainId: number = 143, // Monad mainnet
  daoId: string = 'starworldorder.com'
): string {
  const choiceStr = voteChoiceToString(choice);
  const timestamp = Date.now();
  const date = new Date(timestamp).toISOString();
  const { APP_NAME, VERSION } = VOTE_SIGNATURE_CONFIG;
  
  // Human-readable message that users can understand
  return [
    `=== ${APP_NAME} Vote Signature ===`,
    ``,
    `This is a MESSAGE signature, NOT a transaction.`,
    `Your assets are completely safe.`,
    ``,
    `Domain: ${daoId}`,
    `Chain ID: ${chainId}`,
    `Version: ${VERSION}`,
    ``,
    `I am casting my vote:`,
    ``,
    `  Vote: ${choiceStr}`,
    `  Proposal: ${proposalId}`,
    proposalTitle ? `  Title: ${proposalTitle}` : null,
    `  Snapshot Block: ${snapshotBlock}`,
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
  snapshotBlock: number;
  chainId: number;
  daoId: string;
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
    
    // Extract snapshot block
    const snapshotMatch = message.match(/Snapshot Block: (\d+)/);
    if (!snapshotMatch) return null;
    const snapshotBlock = parseInt(snapshotMatch[1], 10);
    
    // Extract timestamp
    const timestampMatch = message.match(/Timestamp: ([^\n]+)/);
    if (!timestampMatch) return null;
    const timestamp = new Date(timestampMatch[1].trim()).getTime();
    
    // Extract nonce
    const nonceMatch = message.match(/Nonce: ([^\n]+)/);
    if (!nonceMatch) return null;
    const nonce = nonceMatch[1].trim();
    
    // Extract chain ID
    const chainIdMatch = message.match(/Chain ID: (\d+)/);
    const chainId = chainIdMatch ? parseInt(chainIdMatch[1], 10) : 143; // Default to Monad
    
    // Extract DAO ID
    const daoIdMatch = message.match(/Domain: ([^\n]+)/);
    const daoId = daoIdMatch ? daoIdMatch[1].trim() : 'starworldorder.com';
    
    return { choice, proposalId, timestamp, nonce, snapshotBlock, chainId, daoId };
  } catch {
    return null;
  }
}

/**
 * EIP-712 TYPED DATA FUNCTIONS
 * New primary signature method with structured wallet display
 */

/**
 * Construct EIP-712 typed data for a vote
 * This is the NEW primary method for vote signing (replaces EIP-191)
 */
export function constructVoteTypedData(
  proposalId: string,
  choice: VoteChoice | number,
  voterAddress: string,
  nonce: string,
  snapshotBlock: number,
  chainId: number = 143
): VoteTypedData {
  // Validate inputs
  const choiceNum = voteChoiceToNumber(choice);
  if (!validateChoice(choiceNum)) {
    throw new Error(`Invalid vote choice: ${choice}`);
  }
  
  if (!validateProposalId(proposalId)) {
    throw new Error(`Invalid proposal ID: ${proposalId}`);
  }
  
  const validatedAddress = validateAddress(voterAddress);
  
  // Calculate deadline (10 minutes from now)
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
  
  return {
    proposalId,
    choice: choiceNum,
    voter: validatedAddress,
    snapshotBlock: BigInt(snapshotBlock),
    nonce,
    deadline,
  };
}

/**
 * Create EIP-712 signature request for client-side signing
 * Returns both the domain and the typed data
 */
export function createEIP712VoteSignatureRequest(
  proposalId: string,
  choice: VoteChoice | number,
  voterAddress: string,
  nonce: string,
  snapshotBlock: number,
  chainId: number = 143
): {
  domain: TypedDataDomain;
  types: typeof EIP712_VOTE_TYPES;
  primaryType: 'Vote';
  message: VoteTypedData;
  nonce: string;
} {
  const domain = getEIP712Domain(chainId);
  const message = constructVoteTypedData(
    proposalId,
    choice,
    voterAddress,
    nonce,
    snapshotBlock,
    chainId
  );
  
  return {
    domain,
    types: EIP712_VOTE_TYPES,
    primaryType: 'Vote',
    message,
    nonce,
  };
}

/**
 * Verify EIP-712 typed data signature
 * This is the NEW primary verification method
 */
export async function verifyEIP712VoteSignature(
  voterAddress: string,
  voteData: VoteTypedData,
  signature: `0x${string}`,
  chainId: number = 143
): Promise<boolean> {
  try {
    const domain = getEIP712Domain(chainId);
    
    const isValid = await verifyTypedData({
      address: voterAddress as `0x${string}`,
      domain,
      types: EIP712_VOTE_TYPES,
      primaryType: 'Vote',
      message: voteData,
      signature,
    });
    
    return isValid;
  } catch (error) {
    console.error('EIP-712 signature verification failed:', error);
    return false;
  }
}

/**
 * Verify a vote signature (LEGACY EIP-191 method)
 * Kept for backward compatibility with existing votes
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
 * Create a vote signature request object (LEGACY EIP-191 method)
 * NOTE: The nonce MUST be fetched from the server via /api/governance/nonce
 * This function is only used to construct the message once the nonce is obtained
 * 
 * DEPRECATED: Use createEIP712VoteSignatureRequest instead for new votes
 */
export function createVoteSignatureRequest(
  proposalId: string,
  choice: VoteChoice | number,
  nonce: string,
  snapshotBlock: number,
  proposalTitle?: string,
  chainId: number = 143,
  daoId: string = 'starworldorder.com'
): {
  message: string;
  nonce: string;
  version: SignatureVersion;
} {
  const message = constructVoteMessage(
    proposalId,
    choice,
    nonce,
    snapshotBlock,
    proposalTitle,
    chainId,
    daoId
  );
  
  return {
    message,
    nonce,
    version: 'eip191',
  };
}

/**
 * Server-side function to reconstruct vote message from stored data
 * This ensures the client cannot tamper with the message
 */
export function reconstructVoteMessage(
  proposalId: string,
  choice: VoteChoice | number,
  nonce: string,
  snapshotBlock: number,
  proposalTitle?: string,
  chainId: number = 143,
  daoId: string = 'starworldorder.com'
): string {
  return constructVoteMessage(
    proposalId,
    choice,
    nonce,
    snapshotBlock,
    proposalTitle,
    chainId,
    daoId
  );
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
 * LEGACY: Only supports EIP-191 signatures
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
    // Check if this is an EIP-191 signature (legacy)
    if (!signatureData.message) {
      return { valid: false, error: 'Missing message data' };
    }
    
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
 * Comprehensive vote signature verification (supports both EIP-712 and EIP-191)
 * This is the NEW primary verification method that should be used server-side
 */
export async function verifyVoteSignatureComprehensive(
  voterAddress: string,
  proposalId: string,
  choice: number,
  signatureData: {
    signature: string;
    version: SignatureVersion;
    nonce: string;
    snapshotBlock: number;
    chainId?: number;
    // EIP-712 specific
    typedData?: VoteTypedData;
    // EIP-191 specific (legacy)
    message?: string;
  }
): Promise<{
  valid: boolean;
  error?: string;
}> {
  try {
    // Validate inputs first
    if (!validateChoice(choice)) {
      return { valid: false, error: `Invalid choice value: ${choice}` };
    }
    
    if (!validateProposalId(proposalId)) {
      return { valid: false, error: `Invalid proposal ID: ${proposalId}` };
    }
    
    const normalizedAddress = normalizeAddress(voterAddress);
    if (!normalizedAddress) {
      return { valid: false, error: `Invalid voter address: ${voterAddress}` };
    }
    
    const chainId = signatureData.chainId || getChainId();
    
    // Route to appropriate verification based on version
    if (signatureData.version === 'eip712') {
      // EIP-712 verification
      if (!signatureData.typedData) {
        return { valid: false, error: 'Missing typed data for EIP-712 signature' };
      }
      
      // Verify the typed data matches expected values
      if (signatureData.typedData.proposalId !== proposalId) {
        return { valid: false, error: 'Proposal ID mismatch' };
      }
      
      if (signatureData.typedData.choice !== choice) {
        return { valid: false, error: 'Choice mismatch' };
      }
      
      if (signatureData.typedData.voter.toLowerCase() !== normalizedAddress) {
        return { valid: false, error: 'Voter address mismatch' };
      }
      
      if (signatureData.typedData.nonce !== signatureData.nonce) {
        return { valid: false, error: 'Nonce mismatch' };
      }
      
      // Check deadline
      const now = BigInt(Math.floor(Date.now() / 1000));
      if (signatureData.typedData.deadline < now) {
        return { valid: false, error: 'Signature deadline expired' };
      }
      
      // Verify the EIP-712 signature
      const isValid = await verifyEIP712VoteSignature(
        voterAddress,
        signatureData.typedData,
        signatureData.signature as `0x${string}`,
        chainId
      );
      
      if (!isValid) {
        return { valid: false, error: 'Invalid EIP-712 signature' };
      }
      
      return { valid: true };
      
    } else if (signatureData.version === 'eip191') {
      // Legacy EIP-191 verification
      if (!signatureData.message) {
        return { valid: false, error: 'Missing message for EIP-191 signature' };
      }
      
      const isValid = await verifyVoteSignature(
        voterAddress,
        signatureData.message,
        signatureData.signature as `0x${string}`
      );
      
      if (!isValid) {
        return { valid: false, error: 'Invalid EIP-191 signature' };
      }
      
      // Parse and validate message content
      const parsed = parseVoteMessage(signatureData.message);
      if (!parsed) {
        return { valid: false, error: 'Invalid message format' };
      }
      
      if (parsed.proposalId !== proposalId) {
        return { valid: false, error: 'Proposal ID mismatch' };
      }
      
      if (voteChoiceToNumber(parsed.choice) !== choice) {
        return { valid: false, error: 'Choice mismatch' };
      }
      
      if (!isSignatureRecent(parsed.timestamp, VOTE_SIGNATURE_CONFIG.SIGNATURE_MAX_AGE_MINUTES)) {
        return { valid: false, error: 'Signature expired' };
      }
      
      return { valid: true };
      
    } else {
      return { valid: false, error: `Unknown signature version: ${signatureData.version}` };
    }
  } catch (error) {
    return { valid: false, error: `Verification error: ${error}` };
  }
}

/**
 * UI helper: Get user-friendly explanation of what signing means
 */
export const SIGNATURE_SAFETY_EXPLANATION = {
  short: '✅ This is a SIGNATURE, not a transaction. Your assets are safe.',
  
  detailed: [
    '🔐 What is EIP-712 signature signing?',
    '',
    'EIP-712 is an improved signature standard that displays',
    'structured data in your wallet. It proves you own your wallet,',
    'but it CANNOT:',
    '',
    '  ❌ Move your tokens or NFTs',
    '  ❌ Interact with smart contracts',
    '  ❌ Spend your cryptocurrency',
    '  ❌ Give anyone access to your wallet',
    '',
    '✅ It CAN only prove that you cast this specific vote.',
    '',
    'EIP-712 is the gold standard for Web3 signatures, used by',
    'Snapshot, OpenSea, Uniswap, and all major DeFi protocols.',
    'Your wallet will show you exactly what you\'re signing in a',
    'clear, structured format.',
  ].join('\n'),
  
  tooltipText: 'EIP-712 signatures prove wallet ownership with structured data display. They cannot move assets, interact with contracts, or access your funds. This is the industry standard used by Snapshot, OpenSea, Uniswap, and more.',
};

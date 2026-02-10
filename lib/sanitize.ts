/**
 * Input Sanitization Utilities
 * 
 * Provides HTML escaping and wallet address validation for user-generated content.
 * Used across API routes to prevent XSS attacks when content is rendered in the frontend.
 */

/**
 * Escape HTML special characters to prevent XSS attacks.
 * Converts &, <, >, ", and ' to their HTML entity equivalents.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Validate that a string is a valid Ethereum wallet address.
 * Must be a 0x-prefixed, 40 hex character string.
 */
export function isValidWalletAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

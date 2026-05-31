/**
 * Small, pure display formatters shared across the app.
 */

/**
 * Truncate an EVM address for display, e.g. `0x1234...abcd`.
 * Returns '' for an empty/undefined address.
 */
export function truncateAddress(address: string): string {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

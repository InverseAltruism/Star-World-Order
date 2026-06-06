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

/**
 * Get level title based on Star Skrumpey holdings count
 *
 * Title thresholds (based on holdings):
 * - 10+ holdings: COSMIC EMPEROR (highest honor)
 * - 5+ holdings: STAR LORD (veteran collector)
 * - 2+ holdings: COSMIC WARDEN (dedicated member)
 * - 1+ holdings: STAR FORGED (entry level)
 */
export function getLevelTitle(holdingsCount: number): string {
  if (holdingsCount >= 10) return 'COSMIC EMPEROR';
  if (holdingsCount >= 5) return 'STAR LORD';
  if (holdingsCount >= 2) return 'COSMIC WARDEN';
  return 'STAR FORGED';
}

/**
 * Get level color based on Star Skrumpey holdings count
 */
export function getLevelColor(holdingsCount: number): string {
  if (holdingsCount >= 10) return '#ffd700'; // Gold - Cosmic Emperor
  if (holdingsCount >= 5) return '#ff00ff'; // Magenta - Star Lord
  if (holdingsCount >= 2) return '#00ffff'; // Cyan - Cosmic Warden
  return '#9966ff'; // Purple - Star Forged
}

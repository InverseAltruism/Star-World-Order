import { useCallback, useEffect, useState } from 'react';
import type { HolderStatsData } from './types';

/**
 * useHolderStats - owns the holder-stats data fetch + auto-refresh polling.
 *
 * The fetch is keyed on timeRange + constellation, so this hook owns that
 * state and exposes it (plus setters). UI-only state such as the chart zoom
 * level stays in the consuming component.
 *
 * Returns:
 *  - timeRange / setTimeRange, constellation / setConstellation (fetch keys)
 *  - statsData, isLoading, error (fetch result)
 *  - refetch (manual retry, e.g. for the error-state button)
 */
export function useHolderStats() {
  const [timeRange, setTimeRange] = useState<'1H' | '1D' | '1W'>('1D');
  const [constellation, setConstellation] = useState<string>('all');
  const [statsData, setStatsData] = useState<HolderStatsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch holder stats data
  const fetchHolderStats = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(
        `/api/holder-stats?constellation=${constellation}&timeRange=${timeRange}`
      );
      const data = await response.json();

      if (data.success) {
        setStatsData(data.data);
      } else {
        setError(data.error || 'Failed to load holder stats');
      }
    } catch (err) {
      setError('Failed to load holder data');
      console.error('Failed to fetch holder stats:', err);
    } finally {
      setIsLoading(false);
    }
  }, [constellation, timeRange]);

  // Fetch on mount and when filters change
  useEffect(() => {
    fetchHolderStats();
  }, [fetchHolderStats]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(fetchHolderStats, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchHolderStats]);

  return {
    timeRange,
    setTimeRange,
    constellation,
    setConstellation,
    statsData,
    isLoading,
    error,
    refetch: fetchHolderStats,
  };
}

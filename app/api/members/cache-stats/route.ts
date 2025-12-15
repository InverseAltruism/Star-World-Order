/**
 * Star Variant Cache Statistics API
 * 
 * GET /api/members/cache-stats - Get cache statistics for debugging
 * 
 * Returns information about the star variant metadata cache,
 * including how many variants have been fetched and cached.
 */

import { NextResponse } from 'next/server';
import { getCacheStats } from '@/lib/starVariantCache';

export async function GET() {
  try {
    const stats = getCacheStats();
    
    return NextResponse.json({
      success: true,
      cache: {
        cachedVariants: stats.cachedCount,
        totalAttempts: stats.attemptedCount,
        cacheHitRate: stats.attemptedCount > 0 
          ? ((stats.cachedCount / stats.attemptedCount) * 100).toFixed(1) + '%'
          : '0%',
        sampleCachedTokens: stats.cachedTokens.slice(0, 20), // First 20 for preview
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to get cache stats:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch cache statistics' },
      { status: 500 }
    );
  }
}

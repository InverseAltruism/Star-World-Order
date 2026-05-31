'use client';

import React from 'react';
import type { HealthData } from './types';

interface HealthTabProps {
  healthData: HealthData | null;
  isLoadingHealth: boolean;
  fetchHealthData: () => void;
  clearCaches: () => void;
  formatTime: (timestamp: number | null) => string;
}

export default function HealthTab({
  healthData,
  isLoadingHealth,
  fetchHealthData,
  clearCaches,
  formatTime,
}: HealthTabProps) {
  return (
    <div className="pixel-card p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[#44ff88] text-sm tracking-wider">🏥 SYSTEM HEALTH</h2>
        <button
          onClick={fetchHealthData}
          disabled={isLoadingHealth}
          className="pixel-btn text-[10px] !px-3 !py-1"
        >
          {isLoadingHealth ? '...' : 'REFRESH'}
        </button>
      </div>

      {healthData && (
        <div className="space-y-4">
          {/* Status */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#0a0a15] p-3 rounded-lg border border-[#2a2a4e]">
              <p className="text-[#44ff88] text-sm font-bold">✓ {healthData.status.toUpperCase()}</p>
              <p className="text-gray-500 text-[10px]">Status</p>
            </div>
            <div className="bg-[#0a0a15] p-3 rounded-lg border border-[#2a2a4e]">
              <p className="text-[#9966ff] text-sm font-bold">{healthData.environment.toUpperCase()}</p>
              <p className="text-gray-500 text-[10px]">Environment</p>
            </div>
            <div className="bg-[#0a0a15] p-3 rounded-lg border border-[#2a2a4e]">
              <p className={`text-sm font-bold ${healthData.blockvisionApiConfigured ? 'text-[#44ff88]' : 'text-[#ff4466]'}`}>
                {healthData.blockvisionApiConfigured ? '✓ YES' : '✗ NO'}
              </p>
              <p className="text-gray-500 text-[10px]">BlockVision API</p>
            </div>
            <div className="bg-[#0a0a15] p-3 rounded-lg border border-[#2a2a4e]">
              <p className="text-[#ffd700] text-sm font-bold">{healthData.cacheStats.totalEntries}</p>
              <p className="text-gray-500 text-[10px]">Cache Entries</p>
            </div>
          </div>

          {/* Cache Details */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#0a0a15] p-3 rounded-lg">
              <p className="text-white text-xs font-bold">{healthData.cacheStats.nftCache.entries}</p>
              <p className="text-gray-500 text-[10px]">NFT Cache</p>
              <p className="text-gray-600 text-[9px]">{formatTime(healthData.cacheStats.nftCache.oldestEntry)}</p>
            </div>
            <div className="bg-[#0a0a15] p-3 rounded-lg">
              <p className="text-white text-xs font-bold">{healthData.cacheStats.activityCache.entries}</p>
              <p className="text-gray-500 text-[10px]">Activity Cache</p>
              <p className="text-gray-600 text-[9px]">{formatTime(healthData.cacheStats.activityCache.oldestEntry)}</p>
            </div>
            <div className="bg-[#0a0a15] p-3 rounded-lg">
              <p className="text-white text-xs font-bold">{healthData.cacheStats.transactionCache.entries}</p>
              <p className="text-gray-500 text-[10px]">Transaction Cache</p>
              <p className="text-gray-600 text-[9px]">{formatTime(healthData.cacheStats.transactionCache.oldestEntry)}</p>
            </div>
            <div className="bg-[#0a0a15] p-3 rounded-lg">
              <p className="text-white text-xs font-bold">{healthData.cacheStats.floorPriceCache.entries}</p>
              <p className="text-gray-500 text-[10px]">Floor Price Cache</p>
              <p className="text-gray-600 text-[9px]">{formatTime(healthData.cacheStats.floorPriceCache.oldestEntry)}</p>
            </div>
          </div>

          {/* Cache Actions */}
          <div className="flex gap-3">
            <button
              onClick={clearCaches}
              className="pixel-btn text-xs bg-[#ff4466] border-[#ff6688_#aa2244_#aa2244_#ff6688]"
            >
              🗑️ CLEAR ALL CACHES
            </button>
          </div>

          <p className="text-gray-500 text-[10px]">
            ⚠️ Clearing caches will force fresh API calls. Use if Treasury shows stale/no data.
          </p>
        </div>
      )}
    </div>
  );
}

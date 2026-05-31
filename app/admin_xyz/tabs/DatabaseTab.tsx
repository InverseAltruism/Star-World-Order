'use client';

import React, { useState } from 'react';
import type { DatabaseStats } from './types';

/**
 * Cleanup Card Component with dropdown time period selector
 */
function CleanupCard({
  icon,
  title,
  color,
  options,
  onCleanup,
  useDays = false,
}: {
  icon: string;
  title: string;
  color: string;
  options: Array<{ label: string; hours?: number; days?: number }>;
  onCleanup: (value: number) => void;
  useDays?: boolean;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const handleCleanup = () => {
    const option = options[selectedIndex];
    const value = useDays ? option.days! : option.hours!;
    onCleanup(value);
  };

  return (
    <div className="bg-[#0a0a15] p-4 rounded-lg border border-[#2a2a4e]">
      <h4 className="text-xs mb-2" style={{ color }}>{icon} {title}</h4>
      <div className="flex gap-2 mb-3">
        <select
          value={selectedIndex}
          onChange={(e) => setSelectedIndex(parseInt(e.target.value))}
          className="flex-1 bg-[#1a1a2e] border border-[#2a2a4e] rounded px-2 py-1.5 text-[10px] text-white cursor-pointer"
        >
          {options.map((opt, idx) => (
            <option key={idx} value={idx}>{opt.label}</option>
          ))}
        </select>
      </div>
      <button
        onClick={handleCleanup}
        className="pixel-btn text-[10px] w-full"
      >
        CLEANUP ({options[selectedIndex].label})
      </button>
    </div>
  );
}

interface DatabaseTabProps {
  fetchDbStats: () => void;
  isLoadingDbStats: boolean;
  dbStats: DatabaseStats | null;
  runCleanupAction: (action: string, params?: Record<string, number>) => void;
}

export default function DatabaseTab({
  fetchDbStats,
  isLoadingDbStats,
  dbStats,
  runCleanupAction,
}: DatabaseTabProps) {
  return (
    <div className="space-y-6">
      {/* Database Stats */}
      <div className="pixel-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[#ffd700] text-sm tracking-wider">📊 DATABASE STATISTICS</h2>
          <button
            onClick={fetchDbStats}
            disabled={isLoadingDbStats}
            className="pixel-btn text-[10px] !px-3 !py-1"
          >
            {isLoadingDbStats ? '...' : 'REFRESH'}
          </button>
        </div>

        {dbStats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            <div className="bg-[#0a0a15] p-3 rounded-lg border border-[#2a2a4e] text-center">
              <p className="text-[#00ffff] text-xl font-bold">{dbStats.users}</p>
              <p className="text-gray-500 text-[10px]">Users</p>
            </div>
            <div className="bg-[#0a0a15] p-3 rounded-lg border border-[#2a2a4e] text-center">
              <p className="text-[#9966ff] text-xl font-bold">{dbStats.notifications}</p>
              <p className="text-gray-500 text-[10px]">Notifications</p>
            </div>
            <div className="bg-[#0a0a15] p-3 rounded-lg border border-[#2a2a4e] text-center">
              <p className="text-[#44ff88] text-xl font-bold">{dbStats.chatMessages}</p>
              <p className="text-gray-500 text-[10px]">Chat Messages</p>
            </div>
            <div className="bg-[#0a0a15] p-3 rounded-lg border border-[#2a2a4e] text-center">
              <p className="text-[#ff6ec7] text-xl font-bold">{dbStats.raffles}</p>
              <p className="text-gray-500 text-[10px]">Raffles</p>
            </div>
            <div className="bg-[#0a0a15] p-3 rounded-lg border border-[#2a2a4e] text-center">
              <p className="text-[#ffd700] text-xl font-bold">{dbStats.raffleEntries}</p>
              <p className="text-gray-500 text-[10px]">Raffle Entries</p>
            </div>
            <div className="bg-[#0a0a15] p-3 rounded-lg border border-[#2a2a4e] text-center">
              <p className="text-[#00ffff] text-xl font-bold">{dbStats.friends}</p>
              <p className="text-gray-500 text-[10px]">Friend Relations</p>
            </div>
            <div className="bg-[#0a0a15] p-3 rounded-lg border border-[#2a2a4e] text-center">
              <p className="text-[#9966ff] text-xl font-bold">{dbStats.directMessages}</p>
              <p className="text-gray-500 text-[10px]">Direct Messages</p>
            </div>
            <div className="bg-[#0a0a15] p-3 rounded-lg border border-[#2a2a4e] text-center">
              <p className="text-[#44ff88] text-xl font-bold">{dbStats.voiceSessions}</p>
              <p className="text-gray-500 text-[10px]">Voice Sessions</p>
            </div>
            <div className="bg-[#0a0a15] p-3 rounded-lg border border-[#2a2a4e] text-center">
              <p className="text-[#ff6ec7] text-xl font-bold">{dbStats.socialConnections}</p>
              <p className="text-gray-500 text-[10px]">Social Connections</p>
            </div>
          </div>
        )}
      </div>

      {/* Database Cleanup Tools */}
      <div className="pixel-card p-6">
        <h2 className="text-[#ff4466] text-sm tracking-wider mb-4">🧹 DATABASE CLEANUP TOOLS</h2>
        <p className="text-gray-500 text-[10px] mb-4">
          ⚠️ These actions permanently delete data. Use with caution!
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Chat Messages Cleanup */}
          <CleanupCard
            icon="💬"
            title="Chat Messages"
            color="#44ff88"
            options={[
              { label: '1 Day', hours: 24 },
              { label: '3 Days', hours: 72 },
              { label: '7 Days', hours: 168 },
              { label: '14 Days', hours: 336 },
              { label: '30 Days', hours: 720 },
            ]}
            onCleanup={(hours) => runCleanupAction('cleanupChatMessages', { olderThanHours: hours })}
          />

          {/* Online Presence Cleanup */}
          <div className="bg-[#0a0a15] p-4 rounded-lg border border-[#2a2a4e]">
            <h4 className="text-[#9966ff] text-xs mb-2">👤 Online Presence</h4>
            <p className="text-gray-500 text-[9px] mb-3">Delete stale presence records (10+ minutes old)</p>
            <button
              onClick={() => runCleanupAction('cleanupOnlinePresence', { olderThanMinutes: 10 })}
              className="pixel-btn text-[10px] w-full"
            >
              CLEANUP PRESENCE
            </button>
          </div>

          {/* Direct Messages Cleanup */}
          <CleanupCard
            icon="✉️"
            title="Direct Messages"
            color="#00ffff"
            options={[
              { label: '7 Days', days: 7 },
              { label: '14 Days', days: 14 },
              { label: '30 Days', days: 30 },
              { label: '60 Days', days: 60 },
              { label: '90 Days', days: 90 },
            ]}
            onCleanup={(days) => runCleanupAction('cleanupDirectMessages', { olderThanDays: days })}
            useDays
          />

          {/* Notifications Cleanup */}
          <CleanupCard
            icon="🔔"
            title="Notifications"
            color="#ffd700"
            options={[
              { label: '7 Days', days: 7 },
              { label: '14 Days', days: 14 },
              { label: '30 Days', days: 30 },
              { label: '60 Days', days: 60 },
              { label: '90 Days', days: 90 },
            ]}
            onCleanup={(days) => runCleanupAction('cleanupNotifications', { olderThanDays: days })}
            useDays
          />

          {/* Raffle Views Cleanup */}
          <CleanupCard
            icon="🎰"
            title="Raffle Views"
            color="#ff6ec7"
            options={[
              { label: '7 Days', days: 7 },
              { label: '14 Days', days: 14 },
              { label: '30 Days', days: 30 },
              { label: '60 Days', days: 60 },
              { label: '90 Days', days: 90 },
            ]}
            onCleanup={(days) => runCleanupAction('cleanupRaffleResultViews', { olderThanDays: days })}
            useDays
          />

          {/* Forum Content Cleanup */}
          <CleanupCard
            icon="💭"
            title="Forum Threads"
            color="#9966ff"
            options={[
              { label: '30 Days', days: 30 },
              { label: '60 Days', days: 60 },
              { label: '90 Days', days: 90 },
              { label: '180 Days', days: 180 },
              { label: '365 Days', days: 365 },
            ]}
            onCleanup={(days) => runCleanupAction('cleanupForumThreads', { olderThanDays: days })}
            useDays
          />
        </div>
      </div>
    </div>
  );
}

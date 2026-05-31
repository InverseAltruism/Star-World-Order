'use client';

import React from 'react';
import type { UserData } from './types';

interface UsersTabProps {
  fetchUsers: (search?: string) => void;
  isLoadingUsers: boolean;
  userSearchQuery: string;
  setUserSearchQuery: (value: string) => void;
  userCount: number;
  users: UserData[];
}

export default function UsersTab({
  fetchUsers,
  isLoadingUsers,
  userSearchQuery,
  setUserSearchQuery,
  userCount,
  users,
}: UsersTabProps) {
  return (
    <div className="pixel-card p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[#00ffff] text-sm tracking-wider">👥 USER DATABASE</h2>
        <button
          onClick={() => fetchUsers(userSearchQuery)}
          disabled={isLoadingUsers}
          className="pixel-btn text-[10px] !px-3 !py-1"
        >
          {isLoadingUsers ? '...' : 'REFRESH'}
        </button>
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={userSearchQuery}
            onChange={(e) => setUserSearchQuery(e.target.value)}
            placeholder="Search by wallet, display name, or social username..."
            className="flex-1 bg-[#0a0a15] border-2 border-[#2a2a4e] rounded px-3 py-2 text-xs text-white focus:border-[#00ffff] outline-none"
            onKeyDown={(e) => e.key === 'Enter' && fetchUsers(userSearchQuery)}
          />
          <button
            onClick={() => fetchUsers(userSearchQuery)}
            className="pixel-btn text-[10px] !px-4"
          >
            🔍
          </button>
        </div>
      </div>

      <p className="text-gray-500 text-[10px] mb-3">Total: {userCount} users</p>

      {/* Users Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="border-b border-[#2a2a4e]">
              <th className="text-left p-2 text-[#ffd700]">Wallet</th>
              <th className="text-left p-2 text-[#ffd700]">Display Name</th>
              <th className="text-left p-2 text-[#ffd700]">𝕏 Twitter</th>
              <th className="text-left p-2 text-[#ffd700]">Discord</th>
              <th className="text-center p-2 text-[#ffd700]">Level</th>
              <th className="text-center p-2 text-[#ffd700]">XP</th>
              <th className="text-left p-2 text-[#ffd700]">Joined</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.wallet_address} className="border-b border-[#2a2a4e]/50 hover:bg-[#2a2a4e]/20">
                <td className="p-2 font-mono text-gray-300">
                  {user.wallet_address.slice(0, 6)}...{user.wallet_address.slice(-4)}
                </td>
                <td className="p-2 text-white">{user.display_name || '-'}</td>
                <td className="p-2">
                  {user.x_username ? (
                    <a
                      href={`https://x.com/${user.x_username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#00ffff] hover:underline"
                    >
                      @{user.x_username}
                    </a>
                  ) : (
                    <span className="text-gray-600">-</span>
                  )}
                </td>
                <td className="p-2 text-[#7289DA]">{user.discord_username || <span className="text-gray-600">-</span>}</td>
                <td className="p-2 text-center text-[#9966ff] font-bold">{user.level}</td>
                <td className="p-2 text-center text-gray-400">{user.total_xp.toLocaleString()}</td>
                <td className="p-2 text-gray-500">{new Date(user.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gray-500">No users found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

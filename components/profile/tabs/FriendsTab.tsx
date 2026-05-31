'use client';

import React from 'react';
import type { FriendWithProfileData } from '../types';

/**
 * FriendsTab — presentational extraction of the `friends` section of
 * ProfileCard. Renders pending friend requests and the friends list. All state
 * lives in the parent (via useFriends) and is passed in as props. Sending a
 * message switches the parent's chat + active section via the supplied setters.
 */
interface FriendsTabProps {
  address: string | undefined;
  // useFriends
  friends: FriendWithProfileData[];
  pendingRequests: FriendWithProfileData[];
  isLoadingFriends: boolean;
  handleFriendAction: (targetAddress: string, action: string) => void;
  // parent navigation setters (message a friend)
  setSelectedChat: (address: string | null) => void;
  setActiveSection: (section: 'messages') => void;
}

export default function FriendsTab({
  address,
  friends,
  pendingRequests,
  isLoadingFriends,
  handleFriendAction,
  setSelectedChat,
  setActiveSection,
}: FriendsTabProps) {
  return (
        <>
          {/* Pending Friend Requests */}
          {pendingRequests.length > 0 && (
            <div className="pixel-card p-4 animate-slide-in-up border-2 border-[#ff6ec7]">
              <h3 className="text-[#ff6ec7] text-sm tracking-wider mb-3 flex items-center gap-2">
                👋 PENDING REQUESTS ({pendingRequests.length})
              </h3>
              <div className="space-y-2">
                {pendingRequests.map((request) => (
                  <div
                    key={request.id}
                    className="flex items-center justify-between p-3 bg-[#0a0a15] rounded-lg border border-[#2a2a4e]"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#2a2a4e] flex items-center justify-center text-lg">
                        🐸
                      </div>
                      <div>
                        <p className="text-white text-xs font-bold">
                          {request.display_name || `${request.user_address.slice(0, 6)}...${request.user_address.slice(-4)}`}
                        </p>
                        <p className="text-gray-500 text-[9px]">Wants to be your friend</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleFriendAction(request.user_address, 'accept')}
                        className="pixel-btn pixel-btn-gold text-[9px] !px-3 !py-1"
                      >
                        ✓
                      </button>
                      <button
                        onClick={() => handleFriendAction(request.user_address, 'decline')}
                        className="pixel-btn text-[9px] !px-3 !py-1"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Friends List */}
          <div className="pixel-card p-4 animate-slide-in-up">
            <h3 className="text-[#00ffff] text-sm tracking-wider mb-4 flex items-center gap-2">
              👥 SWO FRIENDS ({friends.length})
            </h3>

            {isLoadingFriends ? (
              <div className="flex items-center justify-center py-8">
                <span className="text-2xl animate-spin">⭐</span>
              </div>
            ) : friends.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 px-4">
                <span className="text-4xl mb-2 opacity-50">👥</span>
                <p className="text-gray-500 text-xs text-center">No friends yet</p>
                <p className="text-gray-600 text-[10px] text-center mt-1">
                  Visit the Members page to send friend requests
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {friends.map((friend) => {
                  const friendAddress = friend.user_address === address?.toLowerCase()
                    ? friend.friend_address
                    : friend.user_address;
                  const friendName = friend.display_name || `${friendAddress.slice(0, 6)}...${friendAddress.slice(-4)}`;

                  return (
                    <div
                      key={friend.id}
                      className="flex items-center justify-between p-3 bg-[#0a0a15] rounded-lg border border-[#2a2a4e] hover:border-[#00ffff]/50 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#2a2a4e] flex items-center justify-center text-lg">
                          🐸
                        </div>
                        <div>
                          <p className="text-white text-xs font-bold">{friendName}</p>
                          <p className="text-gray-500 text-[9px] font-mono">{friendAddress.slice(0, 10)}...</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setSelectedChat(friendAddress);
                            setActiveSection('messages');
                          }}
                          className="pixel-btn text-[9px] !px-3 !py-1"
                          title="Send Message"
                        >
                          💬
                        </button>
                        <button
                          onClick={() => handleFriendAction(friendAddress, 'remove')}
                          className="pixel-btn text-[9px] !px-3 !py-1 opacity-50 hover:opacity-100"
                          title="Remove Friend"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
  );
}

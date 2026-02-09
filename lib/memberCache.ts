export interface MemberCacheData {
  address: string;
  tokenIds: number[];
  starVariants: string[];
  count: number;
  displayName?: string;
  bio?: string;
  level: number;
  lastSeen?: string;
  displayedBadges?: string[];
  avatarTokenId?: number;
}

export let memberHolderCache: {
  data: MemberCacheData[];
  timestamp: number;
} | null = null;

export function setMemberHolderCache(data: MemberCacheData[]): void {
  memberHolderCache = {
    data,
    timestamp: Date.now(),
  };
}


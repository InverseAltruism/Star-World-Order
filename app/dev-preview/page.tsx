'use client';

// Dev-only preview of the in-place Sanctuary panels with a real test wallet, so
// the inline Quest Board / Shop can be screenshotted + iterated without a
// connected-wallet session. Not linked anywhere; safe to delete.
import dynamic from 'next/dynamic';

const QuestBoard = dynamic(() => import('@/components/sanctuary/overlays/QuestBoard'), { ssr: false });
const ShopDialog = dynamic(() => import('@/components/sanctuary/overlays/ShopDialog'), { ssr: false });
const TraitsOverlay = dynamic(() => import('@/components/sanctuary/overlays/TraitsOverlay'), { ssr: false });

const W = '0x1cec3a47c47314de00b5ff059db5f3035e566582';
const TOKEN = 561;

export default function DevPreview() {
  return (
    <div className="mx-auto max-w-[520px] space-y-6 p-4">
      <h1 className="text-[#ffd700] text-sm font-['Press_Start_2P']">PREVIEW — Quests</h1>
      <div className="pixel-card p-3">
        <QuestBoard inline walletAddress={W} tokenId={TOKEN} />
      </div>
      <h1 className="text-[#ffd700] text-sm font-['Press_Start_2P']">PREVIEW — Shop</h1>
      <div className="pixel-card p-3">
        <ShopDialog inline walletAddress={W} tokenId={TOKEN} />
      </div>
      <h1 className="text-[#ffd700] text-sm font-['Press_Start_2P']">PREVIEW — Traits</h1>
      <div className="pixel-card p-3">
        <TraitsOverlay inline walletAddress={W} tokenId={TOKEN} />
      </div>
    </div>
  );
}

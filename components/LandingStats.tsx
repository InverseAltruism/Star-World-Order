'use client';

import { useEffect, useState } from 'react';
import { Panel, StatReadout } from './ui';

// SWO V2 — live stats strip on the landing page. Real numbers only (no fakes);
// any source that fails renders a "—" placeholder. See UI_V2_REDESIGN_PLAN §7.
type Stats = {
  holders: number | null;
  treasuryMon: number | null;
  treasuryNfts: number | null;
};

const fmt = (n: number | null) => (n == null ? '—' : n.toLocaleString('en-US'));

export default function LandingStats() {
  const [s, setS] = useState<Stats>({ holders: null, treasuryMon: null, treasuryNfts: null });

  useEffect(() => {
    let alive = true;
    const safe = async (url: string) => {
      try {
        const r = await fetch(url);
        if (!r.ok) return null;
        return await r.json();
      } catch {
        return null;
      }
    };
    (async () => {
      const [holderRes, treasuryRes] = await Promise.all([
        safe('/api/holder-stats'),
        safe('/api/treasury'),
      ]);
      if (!alive) return;
      setS({
        holders: holderRes?.data?.currentHolders ?? null,
        treasuryMon: treasuryRes?.data?.monBalanceFormatted
          ? Math.round(parseFloat(treasuryRes.data.monBalanceFormatted))
          : null,
        treasuryNfts: Array.isArray(treasuryRes?.data?.nftHoldings)
          ? treasuryRes.data.nftHoldings.length
          : null,
      });
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="relative -mt-2 mb-4 px-4">
      <Panel className="mx-auto max-w-3xl !p-5">
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          <StatReadout label="Star Holders" value={fmt(s.holders)} accent="gold" />
          <StatReadout label="Star Skrumpeys" value="333" accent="purple" />
          <StatReadout label="Treasury" value={fmt(s.treasuryMon)} unit="MON" accent="green" />
          <StatReadout label="Treasury NFTs" value={fmt(s.treasuryNfts)} accent="cyan" />
        </div>
      </Panel>
    </section>
  );
}

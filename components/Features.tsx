'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import WalletConnect from './WalletConnect';
import { Panel } from './ui';

type Feature = {
  icon: string;
  title: string;
  description: string;
  color: string;
  href: string;
  external?: boolean;
};

const FEATURES: Feature[] = [
  { icon: 'skr_str_mon2', title: 'THE ORDER', description: 'Exclusive access & governance for Star holders', color: '#ffd700', href: '/dao' },
  { icon: 'monad_logo', title: 'MONAD REALM', description: 'Blazing-fast cosmic infrastructure', color: '#00ffff', href: 'https://monad.xyz', external: true },
  { icon: '🪐', title: 'SANCTUARY', description: 'Adopt & raise your Skrumpey companion', color: '#9966ff', href: '/sanctuary' },
  { icon: '💎', title: 'TREASURY', description: 'Collective DAO resources, on-chain', color: '#44ff88', href: '/treasury' },
  { icon: '💬', title: 'STAR COUNCIL', description: 'Hang with the gang in the lobby', color: '#ff7b00', href: '/hangout' },
  { icon: '🎰', title: 'COSMIC CASINO', description: 'Provably-fair games among the stars', color: '#ff00ff', href: '/casino' },
];

export default function Features() {
  const [visible, setVisible] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const renderIcon = (f: Feature) => {
    const glow = { filter: `drop-shadow(0 0 8px ${f.color}66)` };
    if (f.icon === 'skr_str_mon2')
      return <Image src="/skr_str_mon2.png" alt="" width={56} height={56} className="hover-lift" style={glow} />;
    if (f.icon === 'monad_logo')
      return <Image src="/monad_logo.png" alt="" width={40} height={40} className="hover-lift" style={glow} />;
    return (
      <span className="text-4xl inline-block hover-lift" style={glow}>
        {f.icon}
      </span>
    );
  };

  return (
    <section id="about" className="relative py-16 md:py-24 starfield-bg">
      <div className="max-w-6xl mx-auto px-4">
        {/* Section header */}
        <div
          ref={headerRef}
          className={`text-center mb-12 transition-all duration-700 ease-out ${
            visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <h2
            className="text-lg md:text-xl text-gold mb-4 tracking-wider"
            style={{ fontFamily: 'var(--font-display)', textShadow: '0 0 20px rgba(255,215,0,0.5), 2px 2px 0 rgba(0,0,0,0.8)' }}
          >
            ✦ EXPLORE THE ORDER ✦
          </h2>
          <div
            className="w-48 h-1 bg-gradient-to-r from-transparent via-[#ff00ff] to-transparent mx-auto"
            style={{ boxShadow: '0 0 10px rgba(255,0,255,0.5)' }}
          />
        </div>

        {/* Feature launchpad — each card links to a real destination */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f, i) => {
            const inner = (
              <Panel interactive className="h-full !p-6" style={{ ['--fc' as string]: f.color }}>
                <div className="mb-4">{renderIcon(f)}</div>
                <h3
                  className="text-xs mb-3 tracking-wider font-bold"
                  style={{ color: f.color, textShadow: `0 0 10px ${f.color}60, 1px 1px 0 rgba(0,0,0,0.8)` }}
                >
                  {f.title}
                </h3>
                <p className="text-gray-400 text-[11px] leading-relaxed tracking-wide">{f.description}</p>
                <span
                  className="mt-4 inline-flex items-center gap-1 text-[10px] tracking-wider opacity-70 group-hover:opacity-100 transition-opacity"
                  style={{ color: f.color }}
                >
                  ENTER <span className="transition-transform group-hover:translate-x-1">→</span>
                </span>
                <div
                  className="h-[2px] mt-3 opacity-50 transition-all group-hover:opacity-100 group-hover:h-[3px]"
                  style={{ background: `linear-gradient(90deg, ${f.color}, transparent)`, boxShadow: `0 0 8px ${f.color}60` }}
                />
              </Panel>
            );
            return f.external ? (
              <a key={i} href={f.href} target="_blank" rel="noopener noreferrer" className="block">
                {inner}
              </a>
            ) : (
              <Link key={i} href={f.href} className="block">
                {inner}
              </Link>
            );
          })}
        </div>

        {/* Wallet CTA */}
        <div className="text-center mt-12">
          <Panel className="inline-block !px-8 !py-6 !overflow-visible" accent="dao">
            <p
              className="text-gold text-[10px] mb-3 tracking-wide animate-glow-pulse"
              style={{ textShadow: '0 0 10px rgba(255,215,0,0.5)' }}
            >
              ★ u in or what? ★
            </p>
            <p className="text-gray-400 text-xs mb-4">connect wallet • check stars</p>
            <WalletConnect />
          </Panel>
        </div>
      </div>
    </section>
  );
}

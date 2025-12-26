'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import WalletConnect from './WalletConnect';

export default function Features() {
  const [isHeaderVisible, setIsHeaderVisible] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);

  // Intersection Observer to detect when header section enters viewport
  useEffect(() => {
    const currentRef = headerRef.current;
    if (!currentRef) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Trigger when section is at least 20% visible
        if (entry.isIntersecting) {
          setIsHeaderVisible(true);
          // Disconnect after first intersection for performance
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );

    observer.observe(currentRef);

    return () => observer.disconnect();
  }, []);

  const features = [
    {
      icon: 'skr_str_mon2',
      title: 'THE ORDER',
      description: 'EXCLUSIVE ACCESS FOR STAR HOLDERS',
      color: '#ffd700',
      pixelIcon: '◆',
    },
    {
      icon: 'monad_logo',
      title: 'MONAD REALM',
      description: 'BLAZING FAST COSMIC INFRASTRUCTURE',
      color: '#00ffff',
      pixelIcon: '▸',
    },
    {
      icon: '🗳️',
      title: 'COSMIC VOTING',
      description: 'SHAPE THE FUTURE WITH OTHER STAR HOLDERS',
      color: '#ff00ff',
      pixelIcon: '✦',
    },
    {
      icon: '💎',
      title: 'TREASURY',
      description: 'COLLECTIVE SWO RESOURCES',
      color: '#44ff88',
      pixelIcon: '◈',
    },
    {
      icon: '💬',
      title: 'STAR COUNCIL',
      description: 'HANG WITH THE GANG',
      color: '#ff7b00',
      pixelIcon: '●',
    },
    {
      icon: '🔄',
      title: 'COSMIC EXCHANGE',
      description: 'TRADE AMONGST THE STARS (SOON™)',
      color: '#ff6ec7',
      pixelIcon: '◇',
    },
  ];

  const renderIcon = (icon: string, color: string, index: number) => {
    if (icon === 'skr_str_mon2') {
      return (
        <Image 
          src="/skr_str_mon2.png" 
          alt="Star Skrumpey Monad mascot" 
          width={64} 
          height={64} 
          className="animate-pixel-float hover-lift cursor-pointer smooth-transition"
          style={{ 
            animationDelay: `${index * 0.2}s`,
            filter: `drop-shadow(0 0 8px ${color}40)`,
          }}
        />
      );
    }
    if (icon === 'monad_logo') {
      return (
        <Image 
          src="/monad_logo.png" 
          alt="Monad blockchain logo" 
          width={40} 
          height={40} 
          className="animate-pixel-float hover-lift cursor-pointer smooth-transition"
          style={{ 
            animationDelay: `${index * 0.2}s`,
            filter: `drop-shadow(0 0 8px ${color}40)`,
          }}
        />
      );
    }
    return (
      <span 
        className="text-4xl animate-pixel-float hover-lift cursor-pointer smooth-transition inline-block"
        style={{ 
          animationDelay: `${index * 0.2}s`,
          filter: `drop-shadow(0 0 8px ${color}40)`,
        }}
      >
        {icon}
      </span>
    );
  };

  return (
    <section id="about" className="relative py-16 md:py-24 starfield-bg">
      {/* Section header */}
      <div className="max-w-6xl mx-auto px-4">
        <div 
          ref={headerRef}
          className={`text-center mb-12 transition-all duration-700 ease-out ${
            isHeaderVisible 
              ? 'opacity-100 translate-y-0' 
              : 'opacity-0 translate-y-8'
          }`}
        >
          {/* Retro arcade-style header */}
          <div className="inline-block relative">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-[8px] text-[#9966ff] tracking-widest">
              ═══════════════
            </div>
            <h2 className="text-lg md:text-xl text-[#ffd700] mb-4 tracking-wider" style={{ textShadow: '0 0 20px rgba(255, 215, 0, 0.5), 2px 2px 0 rgba(0,0,0,0.8)' }}>
              ✦ 𓆩 SWO FEATURES 𓆪 ✦
            </h2>
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-[8px] text-[#9966ff] tracking-widest">
              ═══════════════
            </div>
          </div>
          <div className="w-48 h-1 bg-gradient-to-r from-transparent via-[#ff00ff] to-transparent mx-auto mt-6" style={{ boxShadow: '0 0 10px rgba(255, 0, 255, 0.5)' }} />
        </div>

        {/* Features grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => {
            const delayClass = `animate-delay-${Math.min(index + 1, 6)}`;
            return (
            <div
              key={index}
              className={`pixel-card p-6 smooth-transition group animate-slide-in-up ${delayClass}`}
            >
              {/* Pixel art corner indicator */}
              <div 
                className="absolute top-2 right-2 text-[10px] opacity-30 group-hover:opacity-60 smooth-transition"
                style={{ color: feature.color }}
              >
                {feature.pixelIcon}
              </div>
              
              {/* Icon with enhanced glow */}
              <div className="mb-4">
                {renderIcon(feature.icon, feature.color, index)}
              </div>
              
              {/* Title with better visibility */}
              <h3 
                className="text-xs mb-3 tracking-wider smooth-transition font-bold"
                style={{ 
                  color: feature.color,
                  textShadow: `0 0 10px ${feature.color}60, 1px 1px 0 rgba(0,0,0,0.8)`,
                }}
              >
                {feature.title}
              </h3>
              
              {/* Description with improved readability */}
              <p className="text-gray-400 text-xs leading-relaxed tracking-wide" style={{ textShadow: '1px 1px 0 rgba(0,0,0,0.5)' }}>
                {feature.description}
              </p>
              
              {/* Bottom accent line with neon glow */}
              <div 
                className="h-[2px] mt-4 opacity-50 smooth-transition group-hover:opacity-100 group-hover:h-[3px]"
                style={{ 
                  background: `linear-gradient(90deg, ${feature.color}, transparent)`,
                  boxShadow: `0 0 8px ${feature.color}60`,
                }}
              />
              
              {/* Pixel decoration on hover */}
              <div className="absolute bottom-2 left-2 text-[8px] opacity-0 group-hover:opacity-40 smooth-transition" style={{ color: feature.color }}>
                ◢
              </div>
            </div>
            );
          })}
        </div>

        {/* Call to action */}
        <div className="text-center mt-12">
          <div className="pixel-card inline-block px-8 py-6 animate-slide-in-up animate-delay-6 relative !overflow-visible">
            {/* Decorative border */}
            <div className="absolute inset-2 border border-[#ffd700]/20 rounded pointer-events-none" />
            
            <p className="text-[#ffd700] text-[10px] mb-3 tracking-wide animate-glow-pulse" style={{ textShadow: '0 0 10px rgba(255, 215, 0, 0.5)' }}>
              ★ u in or what? ★
            </p>
            <p className="text-gray-400 text-xs mb-4">
              connect wallet • check stars
            </p>
            <WalletConnect />
            
            {/* Pixel corner decorations */}
            <div className="absolute top-1 left-1 text-[6px] text-[#ffd700] opacity-30">◢</div>
            <div className="absolute top-1 right-1 text-[6px] text-[#ffd700] opacity-30">◣</div>
            <div className="absolute bottom-1 left-1 text-[6px] text-[#ffd700] opacity-30">◥</div>
            <div className="absolute bottom-1 right-1 text-[6px] text-[#ffd700] opacity-30">◤</div>
          </div>
        </div>
      </div>
    </section>
  );
}

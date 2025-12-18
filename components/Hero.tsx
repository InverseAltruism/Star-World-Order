'use client';

import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { isProdMode } from '@/lib/config';

export default function Hero() {
  const router = useRouter();
  const isProduction = isProdMode();

  // Pre-generated star positions for consistent rendering (avoid hydration mismatches)
  const starPositions = [
    { left: '5%', top: '10%', delay: '0s', size: 12, type: 'star' },
    { left: '15%', top: '25%', delay: '0.5s', size: 16, type: 'star' },
    { left: '25%', top: '5%', delay: '1s', size: 10, type: 'sparkle' },
    { left: '35%', top: '35%', delay: '0.3s', size: 14, type: 'star' },
    { left: '45%', top: '15%', delay: '0.8s', size: 8, type: 'dot' },
    { left: '55%', top: '40%', delay: '1.2s', size: 18, type: 'star' },
    { left: '65%', top: '8%', delay: '0.2s', size: 12, type: 'sparkle' },
    { left: '75%', top: '30%', delay: '0.7s', size: 10, type: 'star' },
    { left: '85%', top: '18%', delay: '1.5s', size: 16, type: 'star' },
    { left: '92%', top: '45%', delay: '0.4s', size: 14, type: 'dot' },
    { left: '8%', top: '55%', delay: '1.1s', size: 10, type: 'sparkle' },
    { left: '20%', top: '70%', delay: '0.6s', size: 12, type: 'star' },
    { left: '30%', top: '60%', delay: '1.3s', size: 8, type: 'dot' },
    { left: '50%', top: '75%', delay: '0.9s', size: 16, type: 'star' },
    { left: '70%', top: '65%', delay: '1.4s', size: 10, type: 'sparkle' },
    { left: '80%', top: '50%', delay: '0.1s', size: 14, type: 'star' },
    { left: '90%', top: '70%', delay: '0.5s', size: 12, type: 'dot' },
    { left: '12%', top: '80%', delay: '1.0s', size: 18, type: 'star' },
    { left: '60%', top: '85%', delay: '0.2s', size: 10, type: 'sparkle' },
    { left: '95%', top: '90%', delay: '0.8s', size: 8, type: 'star' },
  ];

  const getStarSymbol = (type: string) => {
    switch (type) {
      case 'sparkle': return '✦';
      case 'dot': return '•';
      default: return '★';
    }
  };

  const handleEnterTheOrder = () => {
    router.push('/dao');
  };

  const handleDiscoverMore = () => {
    // Scroll to the about/features section
    const aboutSection = document.getElementById('about');
    if (aboutSection) {
      aboutSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section className="relative min-h-[80vh] flex items-center justify-center overflow-hidden starfield-bg">
      {/* Animated stars background with multiple types */}
      <div className="absolute inset-0 overflow-hidden">
        {starPositions.map((star, i) => (
          <div
            key={i}
            className={`absolute animate-pixel-pulse ${star.type === 'sparkle' ? 'animate-star-rotate' : 'animate-glow-pulse'}`}
            style={{
              left: star.left,
              top: star.top,
              animationDelay: star.delay,
              fontSize: `${star.size}px`,
              color: star.type === 'sparkle' ? '#9966ff' : star.type === 'dot' ? '#ffffff' : '#ffd700',
              opacity: star.type === 'dot' ? 0.4 : 0.5,
              textShadow: star.type === 'star' ? '0 0 10px #ffd700' : 'none',
            }}
          >
            {getStarSymbol(star.type)}
          </div>
        ))}
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-16 text-center">
        {/* Main pixel art star logo with neon glow */}
        <div className="mb-8 relative animate-slide-in-up">
          <div className="inline-block animate-pixel-float">
            <div 
              className="w-24 h-24 md:w-32 md:h-32 mx-auto relative hover-lift cursor-pointer"
              style={{
                background: 'linear-gradient(135deg, #ffd700 0%, #ff8800 100%)',
                clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)',
                boxShadow: '0 0 40px #ffd700, 0 0 80px rgba(255, 215, 0, 0.5), 0 0 120px rgba(255, 136, 0, 0.3)',
                transition: 'all 0.3s ease',
              }}
            />
          </div>
          {/* Decorative corner stars */}
          <span className="absolute top-0 left-1/4 text-[#9966ff] text-xs animate-pixel-pulse" style={{ animationDelay: '0.2s' }}>✦</span>
          <span className="absolute top-0 right-1/4 text-[#ffd700] text-xs animate-pixel-pulse" style={{ animationDelay: '0.5s' }}>✦</span>
        </div>

        {/* Title with pixel styling and enhanced visibility */}
        <h1 
          className="text-lg sm:text-xl md:text-3xl lg:text-4xl mb-6 sm:mb-8 tracking-wider animate-slide-in-up animate-delay-1 glitch-text text-pixel-gold px-2"
          data-text="STAR WORLD ORDER"
        >
          STAR WORLD ORDER
        </h1>
        
        {/* Description with better contrast */}
        <div className="animate-slide-in-up animate-delay-2 mb-6 sm:mb-8 px-4">
          <p className="text-[#ffd700] text-xs sm:text-sm md:text-base mb-2" style={{ textShadow: '2px 2px 0 rgba(0,0,0,0.8)' }}>
            ✦ The Order is forming ✦
          </p>
          <p className="text-[#c4a0ff] text-[10px] sm:text-xs md:text-sm max-w-xl mx-auto leading-relaxed" style={{ textShadow: '1px 1px 0 rgba(0,0,0,0.8)' }}>
            A DAO for Skrumpeys with the Constellation trait
          </p>
        </div>
        
        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 mb-8 sm:mb-12 animate-slide-in-up animate-delay-3 px-4">
          {isProduction ? (
            <button 
              disabled
              className="pixel-btn pixel-btn-gold smooth-transition opacity-50 cursor-not-allowed text-[10px] sm:text-xs"
              title="Locked in production"
            >
              🔒 ENTER THE ORDER 🔒
            </button>
          ) : (
            <button 
              onClick={handleEnterTheOrder}
              className="pixel-btn pixel-btn-gold smooth-transition hover-lift text-[10px] sm:text-xs"
            >
              ⭐ ENTER THE ORDER ⭐
            </button>
          )}
          <button 
            onClick={handleDiscoverMore}
            className="pixel-btn smooth-transition hover-lift text-[10px] sm:text-xs"
          >
            ▼ DISCOVER MORE
          </button>
        </div>

        {/* Pixel art showcase */}
        <div className="pixel-card p-4 sm:p-6 md:p-8 max-w-md mx-4 sm:mx-auto animate-slide-in-up animate-delay-4">
          {/* Decorative header */}
          <div className="flex items-center justify-center gap-2 mb-3 sm:mb-4 text-[8px] text-[#9966ff] tracking-widest">
            <span>◆</span>
            <span>FEATURED</span>
            <span>◆</span>
          </div>
          
          <div className="flex items-center justify-center gap-3 sm:gap-4 mb-3 sm:mb-4">
            <div className="animate-pixel-float hover-lift cursor-pointer smooth-transition" style={{ animationDelay: '0s', filter: 'drop-shadow(0 0 10px rgba(153, 102, 255, 0.5))' }}>
              <Image
                src="/images/Purple_skrumpey.svg"
                alt="Purple Skrumpey"
                width={64}
                height={64}
                className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20"
                unoptimized
              />
            </div>
            <span className="text-2xl sm:text-3xl md:text-5xl text-[#ffd700] animate-pixel-pulse" style={{ textShadow: '0 0 20px #ffd700' }}>+</span>
            <div className="animate-pixel-float hover-lift cursor-pointer smooth-transition" style={{ animationDelay: '0.5s', filter: 'drop-shadow(0 0 10px rgba(255, 215, 0, 0.5))' }}>
              <Image
                src="/images/str_mon2.svg"
                alt="Star Monflare"
                width={64}
                height={64}
                className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20"
                unoptimized
              />
            </div>
          </div>
          
          <div className="border-t-2 border-[#3a3a5e] pt-3 sm:pt-4">
            <p className="text-[#ffd700] text-xs sm:text-sm tracking-wide mb-1" style={{ textShadow: '0 0 10px rgba(255, 215, 0, 0.5)' }}>
              ★ STAR SKRUMPEY ★
            </p>
            <p className="text-gray-400 text-[10px] sm:text-xs">
              Skrumpeys with the Constellation trait
            </p>
          </div>
          
          {/* Pixel corner decoration */}
          <div className="absolute bottom-2 left-2 text-[8px] text-[#ffd700] opacity-30">◢◣</div>
          <div className="absolute bottom-2 right-2 text-[8px] text-[#ffd700] opacity-30">◥◤</div>
        </div>
      </div>
    </section>
  );
}

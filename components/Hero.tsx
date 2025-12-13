'use client';

import { useRouter } from 'next/navigation';

export default function Hero() {
  const router = useRouter();

  // Pre-generated star positions for consistent rendering (avoid hydration mismatches)
  const starPositions = [
    { left: '5%', top: '10%', delay: '0s', size: 12 },
    { left: '15%', top: '25%', delay: '0.5s', size: 16 },
    { left: '25%', top: '5%', delay: '1s', size: 10 },
    { left: '35%', top: '35%', delay: '0.3s', size: 14 },
    { left: '45%', top: '15%', delay: '0.8s', size: 8 },
    { left: '55%', top: '40%', delay: '1.2s', size: 18 },
    { left: '65%', top: '8%', delay: '0.2s', size: 12 },
    { left: '75%', top: '30%', delay: '0.7s', size: 10 },
    { left: '85%', top: '18%', delay: '1.5s', size: 16 },
    { left: '92%', top: '45%', delay: '0.4s', size: 14 },
    { left: '8%', top: '55%', delay: '1.1s', size: 10 },
    { left: '20%', top: '70%', delay: '0.6s', size: 12 },
    { left: '30%', top: '60%', delay: '1.3s', size: 8 },
    { left: '50%', top: '75%', delay: '0.9s', size: 16 },
    { left: '70%', top: '65%', delay: '1.4s', size: 10 },
    { left: '80%', top: '50%', delay: '0.1s', size: 14 },
    { left: '90%', top: '70%', delay: '0.5s', size: 12 },
    { left: '12%', top: '80%', delay: '1.0s', size: 18 },
    { left: '60%', top: '85%', delay: '0.2s', size: 10 },
    { left: '95%', top: '90%', delay: '0.8s', size: 8 },
  ];

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
    <section className="relative min-h-[80vh] flex items-center justify-center overflow-hidden">
      {/* Animated stars background */}
      <div className="absolute inset-0 overflow-hidden">
        {starPositions.map((star, i) => (
          <div
            key={i}
            className="absolute text-[#ffd700] opacity-30 animate-pixel-pulse animate-glow-pulse"
            style={{
              left: star.left,
              top: star.top,
              animationDelay: star.delay,
              fontSize: `${star.size}px`,
            }}
          >
            ★
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
        </div>

        {/* Title with pixel styling */}
        <h1 className="text-xl md:text-3xl lg:text-4xl text-[#ffd700] mb-8 pixel-glow-gold animate-text-flicker tracking-wider animate-slide-in-up animate-delay-1">
          STAR WORLD ORDER
        </h1>
        
        {/* Description */}
        <p className="text-gray-400 text-sm md:text-base max-w-xl mx-auto mb-8 leading-relaxed animate-slide-in-up animate-delay-2">
          <span className="text-[#ffd700]">The Order is forming</span>
          <br />
          <span className="text-[#9966ff]">A DAO for Skrumpeys with the Constellation trait</span>
        </p>
        
        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row justify-center gap-4 mb-12 animate-slide-in-up animate-delay-3">
          <button 
            onClick={handleEnterTheOrder}
            className="pixel-btn pixel-btn-gold smooth-transition hover-lift"
          >
            ENTER THE ORDER
          </button>
          <button 
            onClick={handleDiscoverMore}
            className="pixel-btn smooth-transition hover-lift"
          >
            DISCOVER MORE
          </button>
        </div>

        {/* Pixel art showcase */}
        <div className="pixel-card p-6 md:p-8 max-w-md mx-auto animate-slide-in-up animate-delay-4">
          <div className="flex items-center justify-center gap-4 mb-4">
            <span className="text-5xl md:text-7xl animate-pixel-float hover-lift cursor-pointer smooth-transition" style={{ animationDelay: '0s' }}>🐸</span>
            <span className="text-3xl md:text-5xl text-[#ffd700] animate-pixel-pulse">+</span>
            <span className="text-5xl md:text-7xl animate-pixel-float hover-lift cursor-pointer smooth-transition" style={{ animationDelay: '0.5s' }}>⭐</span>
          </div>
          <div className="border-t-2 border-[#2a2a4e] pt-4">
            <p className="text-[#ffd700] text-sm tracking-wide mb-1">
              STAR SKRUMPEY
            </p>
            <p className="text-gray-500 text-xs">
              Skrumpeys with the Constellation trait
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

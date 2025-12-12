export default function Hero() {
  return (
    <section className="relative min-h-[80vh] flex items-center justify-center overflow-hidden">
      {/* Animated stars background */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute text-[#ffd700] opacity-30 animate-pixel-pulse"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 2}s`,
              fontSize: `${8 + Math.random() * 16}px`,
            }}
          >
            ★
          </div>
        ))}
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-16 text-center">
        {/* Main pixel art star logo */}
        <div className="mb-8 relative">
          <div className="inline-block animate-pixel-float">
            <div 
              className="w-24 h-24 md:w-32 md:h-32 mx-auto relative"
              style={{
                background: 'linear-gradient(135deg, #ffd700 0%, #ff8800 100%)',
                clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)',
                boxShadow: '0 0 40px #ffd700, 0 0 80px rgba(255, 215, 0, 0.5)',
              }}
            />
          </div>
        </div>

        {/* Title with pixel styling */}
        <h1 className="text-xl md:text-3xl lg:text-4xl text-[#ffd700] mb-4 pixel-glow-gold animate-text-flicker tracking-wider">
          STAR WORLD ORDER
        </h1>
        
        {/* Subtitle */}
        <div className="pixel-card inline-block px-6 py-3 mb-8">
          <p className="text-[#9966ff] text-[10px] md:text-xs tracking-wide">
            ★ SKRUMPEY SUB-DAO ON MONAD ★
          </p>
        </div>

        {/* Description */}
        <p className="text-gray-400 text-[10px] md:text-xs max-w-xl mx-auto mb-8 leading-relaxed">
          HOLD A STAR SKRUMPEY TO ENTER THE DAO.
          <br />
          64×64 PIXEL ART • EXCLUSIVE ACCESS • COMMUNITY GOVERNANCE
        </p>
        
        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row justify-center gap-4 mb-12">
          <button className="pixel-btn pixel-btn-gold">
            ★ ENTER DAO
          </button>
          <button className="pixel-btn">
            LEARN MORE
          </button>
        </div>

        {/* Pixel art showcase */}
        <div className="pixel-card p-6 md:p-8 max-w-md mx-auto">
          <div className="flex items-center justify-center gap-4 mb-4">
            <span className="text-5xl md:text-7xl animate-pixel-float" style={{ animationDelay: '0s' }}>🐸</span>
            <span className="text-3xl md:text-5xl text-[#ffd700] animate-pixel-pulse">+</span>
            <span className="text-5xl md:text-7xl animate-pixel-float" style={{ animationDelay: '0.5s' }}>⭐</span>
          </div>
          <div className="border-t-2 border-[#2a2a4e] pt-4">
            <p className="text-[#ffd700] text-[10px] tracking-wide mb-1">
              STAR SKRUMPEY
            </p>
            <p className="text-gray-500 text-[8px]">
              YOUR KEY TO THE STAR WORLD ORDER
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

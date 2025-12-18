import Header from '@/components/Header';
import Hero from '@/components/Hero';
import Features from '@/components/Features';

export default function Home() {
  return (
    <div className="min-h-screen">
      <Header />
      <main>
        <Hero />
        <Features />
      </main>
      <footer className="border-t-4 border-[#2a2a4e] mt-16 bg-[#0a0a15] smooth-transition relative">
        {/* Decorative pixel corners */}
        <div className="absolute top-4 left-4 text-[#ffd700] text-[10px] opacity-30">◢◣</div>
        <div className="absolute top-4 right-4 text-[#ffd700] text-[10px] opacity-30">◥◤</div>
        
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-center">
            {/* Pixel divider */}
            <div className="flex items-center justify-center gap-2 mb-4 text-[8px] text-[#9966ff]">
              <span>════</span>
              <span className="text-[#ffd700]">★</span>
              <span>════</span>
            </div>
            
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="text-[#ffd700] text-xs tracking-wider animate-glow-pulse" style={{ textShadow: '0 0 10px rgba(255, 215, 0, 0.5)' }}>
                ⭐ STAR WORLD ORDER ⭐
              </span>
            </div>
            <p className="text-[#c4a0ff] text-xs tracking-wide mb-2" style={{ textShadow: '1px 1px 0 rgba(0,0,0,0.5)' }}>
              A DAO for Skrumpeys with the Constellation trait
            </p>
            <a 
              href="https://x.com/StrWorldOrder" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-gray-500 text-xs hover:text-gray-400 smooth-transition cursor-pointer"
            >
              The Order is forming • @StrWorldOrder
            </a>
            
            {/* Pixel decoration */}
            <div className="flex items-center justify-center gap-2 mt-4 text-[8px] text-[#9966ff] opacity-50">
              <span>◆</span>
              <span>◇</span>
              <span>◆</span>
            </div>
          </div>
        </div>
        {/* Bottom pixel border with animated neon gradient */}
        <div className="h-1 bg-gradient-to-r from-[#ff00ff] via-[#ffd700] to-[#00ffff]" style={{ boxShadow: '0 0 10px rgba(255, 215, 0, 0.5)' }} />
      </footer>
    </div>
  );
}

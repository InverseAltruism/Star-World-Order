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
      <footer className="border-t-4 border-[#2a2a4e] mt-16 bg-[#0a0a15] smooth-transition">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="text-xl animate-pixel-float hover-lift smooth-transition cursor-pointer">⭐</span>
              <span className="text-[#ffd700] text-xs tracking-wider animate-glow-pulse">STAR WORLD ORDER</span>
              <span className="text-xl animate-pixel-float hover-lift smooth-transition cursor-pointer" style={{ animationDelay: '0.5s' }}>⭐</span>
            </div>
            <p className="text-[#9966ff] text-[8px] tracking-wide mb-2">
              ✦ 𓆩 chosen by the stars 𓆪 ✦
            </p>
            <p className="text-gray-700 text-[8px] hover:text-gray-600 smooth-transition cursor-pointer">
              the order is forming • @skrumpeys
            </p>
          </div>
        </div>
        {/* Bottom pixel border with neon gradient */}
        <div className="h-1 bg-gradient-to-r from-[#ff00ff] via-[#ffd700] to-[#00ffff] animate-pulse" />
      </footer>
    </div>
  );
}

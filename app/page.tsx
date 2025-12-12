import Header from '@/components/Header';
import Hero from '@/components/Hero';
import Features from '@/components/Features';

export default function Home() {
  return (
    <div className="min-h-screen bg-[#0f0f23]">
      <Header />
      <main>
        <Hero />
        <Features />
      </main>
      <footer className="border-t-4 border-[#2a2a4e] mt-16 bg-[#0d0d1a]">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="text-xl animate-pixel-float">⭐</span>
              <span className="text-[#ffd700] text-xs tracking-wider">STAR WORLD ORDER</span>
              <span className="text-xl animate-pixel-float" style={{ animationDelay: '0.5s' }}>⭐</span>
            </div>
            <p className="text-[#9966ff] text-[8px] tracking-wide mb-2">
              ✦ 𓆩 chosen by the stars 𓆪 ✦
            </p>
            <p className="text-gray-700 text-[8px]">
              the order is forming • @skrumpeys
            </p>
          </div>
        </div>
        {/* Bottom pixel border */}
        <div className="h-1 bg-gradient-to-r from-[#9966ff] via-[#ffd700] to-[#9966ff]" />
      </footer>
    </div>
  );
}

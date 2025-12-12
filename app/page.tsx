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
      <footer className="border-t border-gray-800 mt-20">
        <div className="max-w-7xl mx-auto px-4 py-8 text-center text-gray-400">
          <p>&copy; {new Date().getFullYear()} Star World Order. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

import Hero from '@/components/Hero';
import Features from '@/components/Features';

// Header, Footer and the floating FeedbackButton are rendered globally by
// SiteChrome (app/layout.tsx) — see docs/UI_V2_REDESIGN_PLAN.md §6.1.
export default function Home() {
  return (
    <div className="min-h-screen">
      <main>
        <Hero />
        <Features />
      </main>
    </div>
  );
}

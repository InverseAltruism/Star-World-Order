import Header from '@/components/Header';
import SanctuaryContent from './SanctuaryContent';

export const metadata = {
  title: 'Sanctuary | Star World Order',
  description: 'Your Star Skrumpey companion sanctuary - Interact, explore, and bond with your Skrumpey.',
};

export default function SanctuaryPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <SanctuaryContent />
      </main>
    </div>
  );
}

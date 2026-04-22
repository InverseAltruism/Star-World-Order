import Header from '@/components/Header';
import SanctuaryRouter from './SanctuaryRouter';

export const metadata = {
  title: 'Sanctuary | Star World Order',
  description: 'Your Skrumpey companion sanctuary - Interact, explore, and bond with your Skrumpey. Star holders earn premium bonuses!',
};

export default function SanctuaryPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <SanctuaryRouter />
      </main>
    </div>
  );
}

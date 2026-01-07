import SlotsContent from './SlotsContent';

export const metadata = {
  title: 'Star Forge Slots | Cosmic Casino | Star World Order',
  description: 'Play Star Forge Slots - Match constellation patterns on a 5x5 grid for massive wins! Provably fair gaming on Monad.',
};

export default function SlotsPage() {
  return (
    <main className="min-h-screen py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <SlotsContent />
      </div>
    </main>
  );
}

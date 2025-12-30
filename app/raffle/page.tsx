import { Metadata } from 'next';
import RaffleContent from './RaffleContent';

export const metadata: Metadata = {
  title: 'Raffle | Star World Order',
  description: 'Enter the cosmic raffle for exclusive prizes! Higher tier holders get more entries.',
};

export default function RafflePage() {
  return (
    <main className="min-h-screen px-4 py-8 max-w-6xl mx-auto">
      <RaffleContent />
    </main>
  );
}

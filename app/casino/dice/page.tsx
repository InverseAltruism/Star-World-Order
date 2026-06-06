import DiceContent from './DiceContent';

export const metadata = {
  title: 'Gravity Dice | Cosmic Casino | Star World Order',
  description:
    'Roll under your number — provably fair dice on the Cosmic Casino. Quoted payout (stake × 99) / (rollUnder − 1), settled on Monad.',
};

export default function DicePage() {
  return (
    <main className="min-h-screen py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <DiceContent />
      </div>
    </main>
  );
}

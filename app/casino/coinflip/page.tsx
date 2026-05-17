import CoinflipContent from './CoinflipContent';

export const metadata = {
  title: 'Cosmic Flip | Cosmic Casino | Star World Order',
  description:
    'Heads or tails — provably fair coinflip on the Cosmic Casino. 1.98× payout, settled on Monad.',
};

export default function CoinflipPage() {
  return (
    <main className="min-h-screen py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <CoinflipContent />
      </div>
    </main>
  );
}

import CoinflipContent from './CoinflipContent';

export const metadata = {
  title: 'Coinflip | Cosmic Casino | Star World Order',
  description:
    'Play Cosmic Casino Coinflip on Monad — provably fair, 1.98× payouts, instant settlement.',
};

export default function CoinflipPage() {
  return (
    <main className="min-h-screen">
      <CoinflipContent />
    </main>
  );
}

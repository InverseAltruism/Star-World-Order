import CasinoContent from './CasinoContent';

export const metadata = {
  title: 'Cosmic Casino | Star World Order',
  description: 'Enter the Cosmic Casino - Provably fair games on Monad blockchain. Play slots, and more games coming soon!',
};

export default function CasinoPage() {
  return (
    <main className="min-h-screen">
      <CasinoContent />
    </main>
  );
}

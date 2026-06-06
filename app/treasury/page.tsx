import TreasuryContent from './TreasuryContent';

export const metadata = {
  title: 'Treasury | Star World Order',
  description: 'View the Star World Order DAO treasury holdings, NFTs, and cosmic resources.',
};

export default function TreasuryPage() {
  return (
    <div className="min-h-screen">
      <main className="max-w-6xl mx-auto px-4 py-8">
        <TreasuryContent />
      </main>
    </div>
  );
}

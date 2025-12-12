import Header from '@/components/Header';
import MarketplaceContent from './MarketplaceContent';

export const metadata = {
  title: 'Cosmic Exchange | Star World Order',
  description: 'OTC Marketplace for Star Skrumpeys - Coming Soon!',
};

export default function MarketplacePage() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <MarketplaceContent />
      </main>
    </div>
  );
}

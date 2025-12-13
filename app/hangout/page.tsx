import Header from '@/components/Header';
import HangoutContent from './HangoutContent';

export const metadata = {
  title: 'Hangout Hub | Star World Order',
  description: 'Star World Order Hangout Hub - Meet other DAO members in a retro gaming lobby.',
};

export default function HangoutPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <HangoutContent />
      </main>
    </div>
  );
}

import DAOContent from './DAOContent';

export const metadata = {
  title: 'The Order | Star World Order DAO',
  description: 'Star World Order DAO - Governance, voting, and community for Star Skrumpey holders.',
};

export default function DAOPage() {
  return (
    <div className="min-h-screen">
      <main className="max-w-6xl mx-auto px-4 py-8">
        <DAOContent />
      </main>
    </div>
  );
}

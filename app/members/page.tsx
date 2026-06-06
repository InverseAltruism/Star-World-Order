import MembersContent from './MembersContent';

export const metadata = {
  title: 'Members | Star World Order',
  description: 'View all Star Skrumpey holders and their cosmic status in the Star World Order DAO.',
};

export default function MembersPage() {
  return (
    <div className="min-h-screen">
      <main className="max-w-6xl mx-auto px-4 py-8">
        <MembersContent />
      </main>
    </div>
  );
}

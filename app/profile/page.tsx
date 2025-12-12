import Header from '@/components/Header';
import ProfileContent from './ProfileContent';

export const metadata = {
  title: 'Profile | Star World Order',
  description: 'View your Star Skrumpey collection and DAO membership status.',
};

export default function ProfilePage() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <ProfileContent />
      </main>
    </div>
  );
}

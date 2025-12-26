import { Metadata } from 'next';
import AdminContent from './AdminContent';

export const metadata: Metadata = {
  title: 'Admin | Star World Order',
  description: 'Star World Order Admin Dashboard',
  robots: 'noindex, nofollow', // Prevent search engine indexing
};

export default function AdminPage() {
  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8 max-w-6xl mx-auto">
      <AdminContent />
    </main>
  );
}

import Header from '@/components/Header';
import GalleryContent from './GalleryContent';

export const metadata = {
  title: 'Gallery | Star World Order',
  description: 'Browse the complete collection of 333 Star Skrumpey NFTs and explore their unique constellation traits.',
};

export default function GalleryPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <GalleryContent />
      </main>
    </div>
  );
}

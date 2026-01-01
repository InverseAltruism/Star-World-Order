'use client';

import dynamic from 'next/dynamic';

const GalleryContent = dynamic(() => import('./GalleryContent'), { ssr: false });

export default function GalleryPage() {
  return (
    <main className="min-h-screen p-4 sm:p-8 pt-24">
      <GalleryContent />
    </main>
  );
}

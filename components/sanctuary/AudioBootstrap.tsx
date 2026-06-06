'use client';

import { useEffect } from 'react';
import { sanctuaryAudio } from '@/lib/sanctuary/audio';

export default function AudioBootstrap() {
  useEffect(() => {
    sanctuaryAudio.init();
    return () => {
      sanctuaryAudio.dispose();
    };
  }, []);
  return null;
}

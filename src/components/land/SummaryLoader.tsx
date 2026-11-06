'use client';

import dynamic from 'next/dynamic';
import { Spinner } from '@/components/ui/Spinner';

// Reads this browser's imported months and private "my land", so it renders client-side only.
export const SummaryLoader = dynamic(() => import('./SummaryView').then((m) => m.SummaryView), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center">
      <Spinner />
    </div>
  ),
});

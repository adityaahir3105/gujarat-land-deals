'use client';

import dynamic from 'next/dynamic';
import { Spinner } from '@/components/ui/Spinner';

// Leaflet and localStorage need the browser, so the dashboard is rendered client-side only.
export const LandLoader = dynamic(() => import('./LandDashboard').then((m) => m.LandDashboard), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center">
      <Spinner />
    </div>
  ),
});

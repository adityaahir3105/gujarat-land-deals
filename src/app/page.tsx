import type { Metadata } from 'next';
import { MapPinned } from 'lucide-react';
import { defaultVillage, watchFeed } from '@/data/land';
import { LandLoader } from '@/components/land/LandLoader';

export const metadata: Metadata = {
  title: 'Chirai Moti | Gujarat Land Deals',
  description: 'Mutation notices from AnyRoR e-Chavdi for a Gujarat village: sales, loan charges and family transfers, with survey numbers you can pin on a map.',
};

export default function Home() {
  const { village, seed } = defaultVillage();

  return (
    <div className="w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <section className="mb-8">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-accent">
          <MapPinned className="h-4 w-4" />
          Land deals
        </div>
        <h2 className="mt-2 text-3xl font-bold text-zinc-100">
          {village.en.village} <span className="text-zinc-500">· {village.village}</span>
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          {village.en.taluka} taluka, {village.en.district} district, Gujarat · AnyRoR village {village.anyrorCode}
        </p>
        <p className="mt-3 max-w-3xl text-lg leading-relaxed text-zinc-200">
          Every change to a land record is published as a notice on e-Chavdi before it is certified. Read together, the notices show which
          survey numbers are being sold, mortgaged, partitioned or inherited, and when.
        </p>
      </section>

      <LandLoader village={village} seed={seed} watch={watchFeed} />

      <div className="mt-12 space-y-1 text-center text-xs text-zinc-600">
        <p>
          Notices:{' '}
          <a href="https://anyror.gujarat.gov.in/LandRecordRural.aspx" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-400">
            AnyRoR e-Chavdi, Revenue Department, Government of Gujarat
          </a>
          . Online records are for information only and are not certified copies.
        </p>
        <p>
          Village location:{' '}
          <a href={village.approxCenter.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-zinc-400">
            {village.approxCenter.source}
          </a>
          . Imagery: Esri World Imagery. Streets: OpenStreetMap contributors.
        </p>
        <p>Nothing here is legal advice, a valuation or a recommendation to buy or sell.</p>
      </div>
    </div>
  );
}

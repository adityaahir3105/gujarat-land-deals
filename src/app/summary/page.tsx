import type { Metadata } from 'next';
import { defaultVillage, watchFeed } from '@/data/land';
import { SummaryLoader } from '@/components/land/SummaryLoader';

export const metadata: Metadata = {
  title: 'Summary | Gujarat Land Deals',
  description: 'How many land sales and record changes were published on e-Chavdi for the village, month by month.',
};

export default function SummaryPage() {
  const { village, seed } = defaultVillage();
  return (
    <div className="w-full max-w-4xl px-4 py-10 sm:px-6">
      <section className="mb-6">
        <h2 className="text-3xl font-bold text-zinc-100">
          {village.en.village} <span className="text-zinc-500">· {village.village}</span>
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          Land deals in {village.en.taluka} taluka, {village.en.district} · જમીનના સોદા
        </p>
      </section>
      <SummaryLoader village={village} seed={seed} watch={watchFeed} />
    </div>
  );
}

import type { Metadata } from 'next';
import { MapPinned } from 'lucide-react';
import { boundaries, boundaryFor, defaultVillage, watchFeed } from '@/data/land';
import { LandLoader } from '@/components/land/LandLoader';
import { T } from '@/components/LangToggle';

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
          <T en="Land deals" gu="જમીનના સોદા" />
        </div>
        <h2 className="mt-2 text-3xl font-bold text-zinc-100">
          {village.en.village} <span className="text-zinc-500">· {village.village}</span>
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          <T
            en={`${village.en.taluka} taluka, ${village.en.district} district, Gujarat · AnyRoR village ${village.anyrorCode}`}
            gu={`તાલુકો ${village.taluka}, જિલ્લો ${village.district}, ગુજરાત · AnyRoR ગામ ${village.anyrorCode}`}
          />
        </p>
        <p className="mt-3 max-w-3xl text-lg leading-relaxed text-zinc-200">
          <T
            en="Every change to a land record is published as a notice on e-Chavdi before it is certified. Read together, the notices show which survey numbers are being sold, mortgaged, partitioned or inherited, and when."
            gu="જમીન રેકર્ડમાં દરેક ફેરફાર પ્રમાણિત થાય એ પહેલાં ઈ-ચાવડી પર નોંધ તરીકે પ્રસિદ્ધ થાય છે. બધી નોંધો સાથે વાંચતાં ખબર પડે કે કયા સર્વે નંબર ક્યારે વેચાયા, ગીરો મુકાયા, વહેંચાયા કે વારસામાં ગયા."
          />
        </p>
      </section>

      <LandLoader
        village={village}
        seed={seed}
        watch={watchFeed}
        boundary={boundaryFor(village)}
        boundaryAttribution={boundaries.attribution}
      />

      <div className="mt-12 space-y-1 text-center text-xs text-zinc-600">
        <p>
          <T en="Notices:" gu="નોંધો:" />{' '}
          <a href="https://anyror.gujarat.gov.in/LandRecordRural.aspx" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-400">
            <T en="AnyRoR e-Chavdi, Revenue Department, Government of Gujarat" gu="AnyRoR ઈ-ચાવડી, મહેસૂલ વિભાગ, ગુજરાત સરકાર" />
          </a>
          . <T en="Online records are for information only and are not certified copies." gu="ઓનલાઇન રેકર્ડ માત્ર માહિતી માટે છે, પ્રમાણિત નકલ નથી." />
        </p>
        <p>
          <T en="Village location:" gu="ગામનું સ્થાન:" />{' '}
          <a href={village.approxCenter.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-zinc-400">
            {village.approxCenter.source}
          </a>
          . <T en="Village outlines:" gu="ગામની હદ:" />{' '}
          <a href={boundaries.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-zinc-400">
            DataMeet Indian Village Boundaries
          </a>{' '}
          <T
            en="(Census 2001 maps, ODbL). Imagery: Esri World Imagery. Streets: OpenStreetMap contributors."
            gu="(વસ્તી ગણતરી 2001ના નકશા, ODbL). સેટેલાઇટ: Esri World Imagery. રસ્તા: OpenStreetMap contributors."
          />
        </p>
        <p>
          <T
            en="Nothing here is legal advice, a valuation or a recommendation to buy or sell."
            gu="અહીંની કોઈ વાત કાનૂની સલાહ, કિંમત અંદાજ કે ખરીદ-વેચાણની ભલામણ નથી."
          />
        </p>
      </div>
    </div>
  );
}

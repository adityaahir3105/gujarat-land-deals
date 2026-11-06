'use client';

import { Crosshair, ExternalLink, LocateFixed, MapPinned, Trash2 } from 'lucide-react';
import { CATEGORY_META, SurveyHistory, SurveyPin, entryTypeGu, entryTypeInfo } from '@/lib/land';
import { isoToDmy } from './EntriesTable';
import { useLang, useT } from '@/lib/i18n';

interface SurveyPanelProps {
  history: SurveyHistory | undefined;
  survey: string;
  pin: SurveyPin | undefined;
  placing: boolean;
  gpsError: string | null;
  onStartPlacing: () => void;
  onCancelPlacing: () => void;
  onUseGps: () => void;
  onRemovePin: () => void;
}

const btn =
  'inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-200 transition-colors hover:border-zinc-500 hover:bg-zinc-800';

export function SurveyPanel({ history, survey, pin, placing, gpsError, onStartPlacing, onCancelPlacing, onUseGps, onRemovePin }: SurveyPanelProps) {
  const t = useT();
  const gu = useLang() === 'gu';
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-wider text-zinc-500">{t('Survey no.', 'સર્વે નં.')}</p>
        <p className="text-2xl font-semibold tabular-nums text-zinc-100">{survey}</p>
        {history && history.khatas.length > 0 && <p className="text-xs text-zinc-400">{t('Khata', 'ખાતા')} {history.khatas.join(', ')}</p>}
      </div>

      <div className="space-y-2">
        {pin ? (
          <p className="text-xs text-zinc-400">
            {t('Pinned at', 'નકશા પર સ્થાન')} {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
            {pin.note ? ` · ${pin.note}` : ''}
          </p>
        ) : (
          <p className="text-xs text-zinc-400">
            {t('Not on the map yet. Find it on the official village map, then pin it here once.', 'હજુ નકશા પર નથી. સરકારી ગામ નકશામાં શોધીને અહીં એક વાર પિન કરો.')}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {placing ? (
            <button className={`${btn} border-accent/60 text-accent`} onClick={onCancelPlacing}>
              <Crosshair className="h-3.5 w-3.5" /> {t('Click the map… (cancel)', 'નકશા પર ક્લિક કરો… (રદ)')}
            </button>
          ) : (
            <button className={btn} onClick={onStartPlacing}>
              <MapPinned className="h-3.5 w-3.5" /> {pin ? t('Move pin', 'પિન ખસેડો') : t('Pin on map', 'નકશા પર પિન કરો')}
            </button>
          )}
          <button className={btn} onClick={onUseGps} title={t('Use when you are standing on the plot', 'ખેતરમાં ઊભા હો ત્યારે વાપરો')}>
            <LocateFixed className="h-3.5 w-3.5" /> {t('Pin at my location', 'મારા સ્થાન પર પિન કરો')}
          </button>
          {pin && (
            <>
              <a className={btn} href={`https://www.google.com/maps?q=${pin.lat},${pin.lng}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" /> Google Maps
              </a>
              <button className={btn} onClick={onRemovePin}>
                <Trash2 className="h-3.5 w-3.5" /> {t('Remove', 'કાઢો')}
              </button>
            </>
          )}
        </div>
        {gpsError && <p className="text-xs text-rose-400">{gpsError}</p>}
      </div>

      <div>
        <p className="mb-2 text-xs uppercase tracking-wider text-zinc-500">{t('In the imported notices', 'ઉમેરેલી નોંધોમાં')}</p>
        {history ? (
          <ol className="relative space-y-3 border-l border-zinc-800 pl-4">
            {history.entries.map((e) => {
              const info = entryTypeInfo(e.typeGu);
              return (
                <li key={e.entryNo} className="relative">
                  <span
                    className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-zinc-950"
                    style={{ background: CATEGORY_META[info.category].color }}
                  />
                  <p className="text-sm text-zinc-200">{gu ? entryTypeGu(e.typeGu) : info.en}</p>
                  <p className="text-xs text-zinc-500">
                    {t('Entry', 'નોંધ')} {e.entryNo} · {isoToDmy(e.date)}
                    {gu ? '' : ` · ${e.typeGu}`}
                  </p>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-xs text-zinc-500">{t('No notices for this survey in the imported months.', 'ઉમેરેલા મહિનામાં આ સર્વેની કોઈ નોંધ નથી.')}</p>
        )}
      </div>

      <p className="text-xs text-zinc-500">
        {t('For owners, area and the full entry, look up the survey on', 'માલિક, ક્ષેત્રફળ અને આખી નોંધ માટે સર્વે')}{' '}
        <a href="https://anyror.gujarat.gov.in/LandRecordRural.aspx" target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-300">
          AnyRoR
        </a>{' '}
        {t(
          '(VF-7 / VF-6). Online copies are for information only, not certified records.',
          'પર જુઓ (7/12 / ગામ નમૂનો 6). ઓનલાઇન નકલ માત્ર માહિતી માટે છે, પ્રમાણિત રેકર્ડ નથી.'
        )}
      </p>
    </div>
  );
}

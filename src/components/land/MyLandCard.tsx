'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Lock, MapPin, Pencil, X } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import {
  ChavdiEntry,
  PinMap,
  RELATION_META,
  RELATION_ORDER,
  Relation,
  RelationKind,
  entryTypeGu,
  entryTypeInfo,
  normaliseSurvey,
  objectionWindow,
  parseSurveyInput,
} from '@/lib/land';
import type { NearbySettings } from '@/lib/land-storage';
import { cn } from '@/lib/utils';
import { Translate, useLang, useT } from '@/lib/i18n';
import { isoToDmy } from './EntriesTable';

interface MyLandCardProps {
  myLand: string[];
  onChangeMyLand: (surveys: string[]) => void;
  entries: ChavdiEntry[];
  relations: Map<number, Relation>;
  nearby: NearbySettings;
  onChangeNearby: (n: NearbySettings) => void;
  pins: PinMap;
  today: string;
  monthsImported: number;
  onSelect: (survey: string) => void;
}

const RADII = [0, 0.5, 1, 2, 5];

export function formatKm(km: number) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

/** One line on how a notice relates to your land, e.g. "600 m from your 210/p1". */
export function relationText(r: Relation, t: Translate): string {
  switch (r.kind) {
    case 'mine':
      return t(`Your survey ${r.mySurvey}`, `તમારો સર્વે ${r.mySurvey}`);
    case 'same-survey':
      return t(`Same original survey as your ${r.mySurvey}`, `તમારા ${r.mySurvey}ના જ મૂળ સર્વેનો ભાગ`);
    case 'pinned-near':
      return t(`${formatKm(r.distanceKm ?? 0)} from your ${r.mySurvey}`, `તમારા ${r.mySurvey}થી ${formatKm(r.distanceKm ?? 0)}`);
    case 'number-near':
      return t(`Survey no. ${r.numberGap} away from your ${r.mySurvey} (a guess)`, `તમારા ${r.mySurvey}થી સર્વે નંબરમાં ${r.numberGap}નો ફરક (અંદાજ)`);
  }
}
const WINDOWS = [0, 5, 10, 25];

function Choice<T extends number>({ label, options, value, onChange, format }: {
  label: string;
  options: T[];
  value: T;
  onChange: (v: T) => void;
  format: (v: T) => string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-zinc-400">{label}</span>
      <div className="flex rounded-lg border border-zinc-800 bg-zinc-900/60 p-0.5" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onChange(o)}
            aria-pressed={o === value}
            className={cn('rounded-md px-2 py-1 text-xs', o === value ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200')}
          >
            {format(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function MyLandCard({
  myLand,
  onChangeMyLand,
  entries,
  relations,
  nearby,
  onChangeNearby,
  pins,
  today,
  monthsImported,
  onSelect,
}: MyLandCardProps) {
  const [editing, setEditing] = useState(myLand.length === 0);
  const [draft, setDraft] = useState(myLand.join(', '));
  const t = useT();
  const gu = useLang() === 'gu';

  const pinned = new Set(Object.keys(pins).map(normaliseSurvey));
  const related = entries
    .filter((e) => relations.has(e.entryNo))
    .map((e) => ({ e, r: relations.get(e.entryNo)! }))
    .sort((a, b) => b.e.date.localeCompare(a.e.date) || b.e.entryNo - a.e.entryNo);
  const onMine = related.filter((x) => x.r.kind === 'mine');
  const nearbyList = related.filter((x) => x.r.kind !== 'mine');
  const counts = RELATION_ORDER.slice(1).map((k) => [k, nearbyList.filter((x) => x.r.kind === k).length] as const);

  function save() {
    const next = parseSurveyInput(draft);
    onChangeMyLand(next);
    setDraft(next.join(', '));
    setEditing(next.length === 0);
  }

  return (
    <Card className="p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-zinc-100">{t('My land', 'મારી જમીન')}</h3>
          <p className="flex items-center gap-1 text-xs text-zinc-500">
            <Lock className="h-3 w-3" /> {t('Saved only in this browser. It is not part of the public site.', 'ફક્ત આ બ્રાઉઝરમાં સાચવેલું. જાહેર સાઇટમાં નથી.')}
          </p>
        </div>
        {!editing && (
          <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-zinc-500">
            <Pencil className="h-3.5 w-3.5" /> {t('Edit survey nos.', 'સર્વે નં. બદલો')}
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-4 space-y-2">
          <label htmlFor="myland" className="text-sm text-zinc-300">
            {t('Your survey numbers, as AnyRoR writes them', 'તમારા સર્વે નંબર, AnyRoR માં લખ્યા હોય એ રીતે')}
          </label>
          <input
            id="myland"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            placeholder={t('e.g. 58, 118/2, 260/1/p1', 'દા.ત. 58, 118/2, 260/1/પૈકી1')}
            className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
          />
          <div className="flex gap-2">
            <button onClick={save} className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-zinc-950 hover:bg-accent/90">
              {t('Save', 'સાચવો')}
            </button>
            {myLand.length > 0 && (
              <button
                onClick={() => {
                  setDraft(myLand.join(', '));
                  setEditing(false);
                }}
                className="rounded-md px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
              >
                {t('Cancel', 'રદ કરો')}
              </button>
            )}
          </div>
          <p className="text-xs text-zinc-500">{t('Separate with commas. Gujarati digits and પૈકી are understood.', 'અલ્પવિરામથી અલગ કરો. ગુજરાતી અંક અને પૈકી ચાલે.')}</p>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {myLand.map((s) => (
            <span key={s} className="inline-flex items-center overflow-hidden rounded-md border border-accent/40 bg-accent/10 text-sm">
              <button onClick={() => onSelect(s)} className="inline-flex items-center gap-1 px-2 py-1 tabular-nums text-zinc-100 hover:bg-accent/20" title={t('Show on map / pin it', 'નકશા પર બતાવો / પિન કરો')}>
                {pinned.has(s) && <MapPin className="h-3.5 w-3.5 text-accent" aria-label={t('pinned', 'નકશા પર')} />}
                {s}
              </button>
              <button onClick={() => onChangeMyLand(myLand.filter((x) => x !== s))} className="px-1.5 py-1 text-zinc-500 hover:text-zinc-200" aria-label={t(`Remove ${s}`, `${s} કાઢો`)}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {myLand.length > 0 && (
        <>
          {/* Notices on your own survey numbers */}
          <div className="mt-5">
            {onMine.length === 0 ? (
              <p className="flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-zinc-300">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                {t(
                  `No notice lists your survey numbers in the ${monthsImported} imported month${monthsImported === 1 ? '' : 's'}.`,
                  `ઉમેરેલા ${monthsImported} મહિનાની કોઈ નોંધમાં તમારા સર્વે નંબર નથી.`
                )}
              </p>
            ) : (
              <div className="space-y-2">
                {onMine.map(({ e, r }) => {
                  const w = objectionWindow(e, today);
                  const open = w.daysLeft >= 0;
                  return (
                    <div
                      key={e.entryNo}
                      className={cn('flex items-start gap-2 rounded-lg border p-3 text-sm', open ? 'border-amber-500/40 bg-amber-500/10' : 'border-zinc-700 bg-zinc-900/60')}
                    >
                      <AlertTriangle className={cn('mt-0.5 h-4 w-4 shrink-0', open ? 'text-amber-400' : 'text-zinc-500')} />
                      <div>
                        <p className="text-zinc-100">
                          {gu
                            ? `નોંધ ${e.entryNo}: સર્વે ${r.survey} પર ${entryTypeGu(e.typeGu)}, ${isoToDmy(e.date)}`
                            : `Entry ${e.entryNo}: ${entryTypeInfo(e.typeGu).en} (${e.typeGu}) on survey ${r.survey}, ${isoToDmy(e.date)}`}
                        </p>
                        <p className="mt-0.5 text-xs text-zinc-400">
                          {open
                            ? t(
                                `Objection window ≈ ${w.daysLeft} days left (estimated from the entry date). If you did not expect this, check the entry on AnyRoR (VF-6) and the Mamlatdar office before it closes.`,
                                `વાંધા અરજીની મુદત ≈ ${w.daysLeft} દિવસ બાકી (નોંધની તારીખ પરથી અંદાજ). આ નોંધ અપેક્ષિત ન હોય તો મુદત પૂરી થાય એ પહેલાં AnyRoR (ગામ નમૂનો 6) પર નોંધ અને મામલતદાર કચેરીમાં તપાસ કરો.`
                              )
                            : t(`Objection window closed ≈ ${isoToDmy(w.closes)}.`, `વાંધા અરજીની મુદત પૂરી ≈ ${isoToDmy(w.closes)}.`)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Nearby */}
          <div className="mt-5">
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <h4 className="text-sm font-medium text-zinc-200">{t('Deals near my land', 'મારી જમીન નજીકના સોદા')}</h4>
              <Choice
                label={t('On the map within', 'નકશા પર અંતર')}
                options={RADII}
                value={nearby.radiusKm}
                onChange={(radiusKm) => onChangeNearby({ ...nearby, radiusKm })}
                format={(v) => (v ? `${v} km` : t('off', 'બંધ'))}
              />
              <Choice
                label={t('Survey no. within', 'સર્વે નંબરમાં ફરક')}
                options={WINDOWS}
                value={nearby.numberWindow}
                onChange={(numberWindow) => onChangeNearby({ ...nearby, numberWindow })}
                format={(v) => (v ? `±${v}` : t('off', 'બંધ'))}
              />
            </div>
            <p className="mb-3 text-xs text-zinc-500">
              {counts.map(([k, n]) => `${t(RELATION_META[k as RelationKind].label, RELATION_META[k as RelationKind].labelGu)}: ${n}`).join(' · ')}.{' '}
              {t(
                `${myLand.filter((s) => pinned.has(s)).length} of ${myLand.length} of your survey numbers are pinned; distance only works for pinned survey numbers on both sides. Close survey numbers are a hint, not a distance.`,
                `તમારા ${myLand.length}માંથી ${myLand.filter((s) => pinned.has(s)).length} સર્વે નંબર નકશા પર છે; અંતર ત્યારે જ ગણાય જ્યારે બંને સર્વે નંબર નકશા પર હોય. નજીકના નંબર માત્ર સંકેત છે, અંતર નહીં.`
              )}
            </p>
            {nearbyList.length === 0 ? (
              <p className="text-sm text-zinc-500">{t('Nothing nearby with these settings.', 'આ સેટિંગમાં નજીક કંઈ નથી.')}</p>
            ) : (
              <ul className="divide-y divide-zinc-800/70 rounded-lg border border-zinc-800">
                {nearbyList.slice(0, 30).map(({ e, r }) => {
                  const info = entryTypeInfo(e.typeGu);
                  return (
                    <li key={e.entryNo} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                      <span className="tabular-nums text-zinc-400">{isoToDmy(e.date)}</span>
                      <span className="text-zinc-200">{gu ? entryTypeGu(e.typeGu) : info.en}</span>
                      <button onClick={() => onSelect(r.survey)} className="rounded border border-zinc-700 px-1.5 py-0.5 text-xs tabular-nums text-zinc-300 hover:border-zinc-500">
                        {r.survey}
                      </button>
                      <span className="text-xs text-zinc-500">{relationText(r, t)}</span>
                      <span className="ml-auto text-xs text-zinc-500">{t('Entry', 'નોંધ')} {e.entryNo}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            {nearbyList.length > 30 && (
              <p className="mt-2 text-xs text-zinc-500">
                {t(
                  `Showing the latest 30 of ${nearbyList.length}. The notices table can filter all of them.`,
                  `${nearbyList.length}માંથી છેલ્લી 30 બતાવી છે. નીચેના નોંધ કોષ્ટકમાં બધી જોઈ શકાય.`
                )}
              </p>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

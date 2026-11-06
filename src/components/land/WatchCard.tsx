'use client';

import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Radar } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import type { VillageKey } from '@/lib/land';
import { landStorage } from '@/lib/land-storage';
import { WATCH_CATEGORY_META, WATCH_SCOPE_GU, WATCH_SCOPE_LABEL, WatchFeed, matchWatchItem, sortWatchItems } from '@/lib/watch';
import { cn } from '@/lib/utils';
import { monthName } from './ActivityChart';
import { isoToDmy } from './EntriesTable';
import { useLang, useT } from '@/lib/i18n';

interface WatchCardProps {
  feed: WatchFeed;
  village: VillageKey;
  myLand: string[];
  /** Latest e-Chavdi month in the data (yyyy-mm), for the collection reminder. */
  lastNoticeMonth: string | undefined;
  today: string;
}

export function WatchCard({ feed, village, myLand, lastNoticeMonth, today }: WatchCardProps) {
  const items = useMemo(() => sortWatchItems(feed.items), [feed]);
  const [seenBefore] = useState(() => landStorage.loadSeenWatch(village));
  const [showAll, setShowAll] = useState(false);
  const lang = useLang();
  const gu = lang === 'gu';
  const t = useT();

  useEffect(() => {
    landStorage.saveSeenWatch(village, feed.items.map((i) => i.id));
  }, [village, feed]);

  const fresh = useMemo(() => new Set(seenBefore ? items.filter((i) => !seenBefore.includes(i.id)).map((i) => i.id) : []), [items, seenBefore]);
  const matches = useMemo(() => new Map(items.map((i) => [i.id, matchWatchItem(i, myLand)])), [items, myLand]);
  const touching = items.filter((i) => (matches.get(i.id)?.length ?? 0) > 0);

  // e-Chavdi can't be checked automatically (CAPTCHA); say which month to collect next.
  const thisMonth = today.slice(0, 7);
  const lastComplete = (() => {
    const [y, m] = thisMonth.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 2, 1));
    return d.toISOString().slice(0, 7);
  })();
  const behind = !lastNoticeMonth || lastNoticeMonth < lastComplete;

  const shown = showAll ? items : items.slice(0, 5);

  return (
    <Card className="p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold text-zinc-100">
            <Radar className="h-5 w-5 text-accent" /> {t('Area watch', 'આસપાસના વિકાસ')}
          </h3>
          <p className="text-xs text-zinc-500">
            {t(
              `Public news and notices for Chirai Moti, Bhachau and the NH-41 corridor. Checked weekly; feed last changed ${isoToDmy(feed.updated)}.`,
              `ચીરઈ મોટી, ભચાઉ અને NH-41 આસપાસના જાહેર સમાચાર અને જાહેરનામાં. દર અઠવાડિયે તપાસાય છે; છેલ્લે બદલાયું ${isoToDmy(feed.updated)}.`
            )}
          </p>
        </div>
        {fresh.size > 0 && (
          <span className="rounded bg-sky-500/15 px-2 py-1 text-xs font-medium text-sky-300">
            {t(`${fresh.size} new since your last visit`, `છેલ્લી મુલાકાત પછી ${fresh.size} નવી`)}
          </span>
        )}
      </div>

      {myLand.length > 0 && (
        <p
          className={cn(
            'mt-4 rounded-lg border px-3 py-2 text-sm',
            touching.length ? 'border-amber-500/40 bg-amber-500/10 text-amber-100' : 'border-emerald-500/20 bg-emerald-500/5 text-zinc-300'
          )}
        >
          {touching.length
            ? t(
                `${touching.length} item${touching.length === 1 ? '' : 's'} name${touching.length === 1 ? 's' : ''} one of your survey numbers or another part of the same survey. They are marked below.`,
                `${touching.length} બાબતમાં તમારો સર્વે નંબર કે એ જ સર્વેનો બીજો ભાગ છે. નીચે નિશાની કરી છે.`
              )
            : t('No item in the feed names your survey numbers.', 'કોઈ બાબતમાં તમારા સર્વે નંબર નથી.')}
        </p>
      )}

      {behind && (
        <p className="mt-3 text-xs text-zinc-400">
          {gu
            ? `ઈ-ચાવડી આપમેળે તપાસી શકાતી નથી (CAPTCHA જોઈએ). ${lastNoticeMonth ? `અહીં નોંધો ${monthName(lastNoticeMonth, true, lang)} સુધી છે; ` : ''}સમય મળે ત્યારે ${monthName(lastComplete, true, lang)} ઉમેરો (જુઓ “મહિના ઉમેરો”).`
            : `e-Chavdi can't be checked automatically (it needs a CAPTCHA). ${lastNoticeMonth ? `The notices here end at ${monthName(lastNoticeMonth)}; ` : ''}collect ${monthName(lastComplete)} when you next have a minute (see “Add months”).`}
        </p>
      )}

      <ul className="mt-4 space-y-3">
        {shown.map((it) => {
          const m = matches.get(it.id) ?? [];
          const cat = WATCH_CATEGORY_META[it.category];
          return (
            <li key={it.id} className={cn('rounded-lg border p-3', m.length ? 'border-amber-500/40 bg-amber-500/5' : 'border-zinc-800 bg-zinc-950/40')}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span className="tabular-nums text-zinc-400">{isoToDmy(it.date)}</span>
                <span className="flex items-center gap-1 text-zinc-300">
                  <span className="h-2 w-2 rounded-sm" style={{ background: cat.color }} />
                  {t(cat.label, cat.gu)}
                </span>
                <span className="text-zinc-500">· {t(WATCH_SCOPE_LABEL[it.scope], WATCH_SCOPE_GU[it.scope])}</span>
                {fresh.has(it.id) && <span className="rounded bg-sky-500/15 px-1 py-0.5 text-[10px] font-medium text-sky-300">{t('NEW', 'નવી')}</span>}
              </div>
              <p className="mt-1 text-sm font-medium text-zinc-100">{gu && it.titleGu ? it.titleGu : it.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-zinc-400">{gu && it.summaryGu ? it.summaryGu : it.summary}</p>
              {it.surveys.length > 0 && (
                <p className="mt-2 text-xs text-zinc-400">
                  {t('Survey nos. named:', 'જણાવેલા સર્વે નં.:')} <span className="tabular-nums text-zinc-300">{it.surveys.join(', ')}</span>
                </p>
              )}
              {m.length > 0 && (
                <p className="mt-1 text-xs text-amber-300">
                  {m
                    .map((x) =>
                      x.exact
                        ? t(`Names your survey ${x.mySurvey}`, `તમારો સર્વે ${x.mySurvey} જણાવ્યો છે`)
                        : t(`${x.survey} is part of the same survey as your ${x.mySurvey}`, `${x.survey} એ તમારા ${x.mySurvey}ના જ સર્વેનો ભાગ છે`)
                    )
                    .join(' · ')}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {it.sources.map((s) => (
                  <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-zinc-400 underline hover:text-zinc-200">
                    <ExternalLink className="h-3 w-3" /> {s.label}
                  </a>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      {items.length > 5 && (
        <button onClick={() => setShowAll((v) => !v)} className="mt-3 text-xs text-zinc-400 underline hover:text-zinc-200">
          {showAll ? t('Show fewer', 'ઓછી બતાવો') : t(`Show all ${items.length}`, `બધી ${items.length} બતાવો`)}
        </button>
      )}
      <p className="mt-3 text-xs text-zinc-500">
        {t(
          'Summaries of public reports with their sources; read the source before relying on a detail. Not legal advice or a valuation.',
          'જાહેર અહેવાલોનો સાર, સ્ત્રોત સાથે; કોઈ વિગત પર આધાર રાખતા પહેલાં સ્ત્રોત વાંચો. કાનૂની સલાહ કે કિંમત અંદાજ નથી.'
        )}
      </p>
    </Card>
  );
}

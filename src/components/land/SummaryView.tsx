'use client';

import { useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { ChavdiEntry, LandDataset, coverage, entryTypeInfo, mergeDatasets, monthRange, objectionWindow, relateAll } from '@/lib/land';
import { landStorage } from '@/lib/land-storage';
import type { VillageConfig } from '@/data/land/villages';
import { cn } from '@/lib/utils';
import { WATCH_SCOPE_LABEL, WatchFeed, sortWatchItems } from '@/lib/watch';
import { monthName } from './ActivityChart';
import { isoToDmy } from './EntriesTable';

interface SummaryViewProps {
  village: VillageConfig;
  seed: LandDataset;
  watch: WatchFeed;
}

const isSale = (e: ChavdiEntry) => entryTypeInfo(e.typeGu).en === 'Sale';

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function BigNumber({ value, en, gu, sub }: { value: number; en: string; gu: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <p className="text-4xl font-semibold tabular-nums text-zinc-100">{value}</p>
      <p className="mt-2 text-sm text-zinc-200">{en}</p>
      <p className="text-sm text-zinc-400">{gu}</p>
      {sub && <p className="mt-1 text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}

export function SummaryView({ village, seed, watch }: SummaryViewProps) {
  // Client-only (see SummaryLoader): reads this browser's imports and private "my land".
  const [imports] = useState(() => landStorage.loadImports(seed));
  const [myLand] = useState(() => landStorage.loadMyLand(seed));
  const [pins] = useState(() => landStorage.loadPins(seed));
  const [nearby] = useState(() => landStorage.loadNearby(seed));
  const [today] = useState(localToday);
  const [span, setSpan] = useState<12 | 24>(12);

  const data = useMemo(() => (imports ? mergeDatasets(seed, imports) : seed), [seed, imports]);
  const months = useMemo(() => monthRange(today.slice(0, 7), span), [today, span]);
  const inSpan = useMemo(() => data.entries.filter((e) => e.date.slice(0, 7) >= months[0]), [data, months]);
  const cov = coverage(data, months);
  const imported = new Set(data.months);

  // Only reliable relations count as "near" here; close survey numbers are a guess.
  const relations = useMemo(
    () => relateAll(inSpan, myLand, { pins, radiusKm: nearby.radiusKm, numberWindow: 0 }),
    [inSpan, myLand, pins, nearby.radiusKm]
  );

  const sales = inSpan.filter(isSale);
  // "Near" excludes your own survey numbers, which have their own tile.
  const salesNear = sales.filter((e) => { const k = relations.get(e.entryNo)?.kind; return !!k && k !== 'mine'; });
  const onMine = inSpan.filter((e) => relations.get(e.entryNo)?.kind === 'mine');
  const openOnMine = onMine.filter((e) => objectionWindow(e, today).daysLeft >= 0);

  const perMonth = months.map((m) => ({ month: m, has: imported.has(m), n: sales.filter((e) => e.date.startsWith(m)).length }));
  const max = Math.max(1, ...perMonth.map((p) => p.n));
  const latest = [...sales].sort((a, b) => b.date.localeCompare(a.date) || b.entryNo - a.entryNo).slice(0, 10);
  const first = data.months[0];
  const last = data.months[data.months.length - 1];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-lg border border-zinc-800 bg-zinc-900/60 p-1" role="group" aria-label="Period">
          {([12, 24] as const).map((n) => (
            <button
              key={n}
              onClick={() => setSpan(n)}
              aria-pressed={span === n}
              className={cn('rounded-md px-3 py-1.5 text-sm', span === n ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200')}
            >
              Last {n} months · છેલ્લા {n} મહિના
            </button>
          ))}
        </div>
      </div>

      <p
        className={cn(
          'flex items-start gap-2 rounded-lg border px-3 py-2 text-sm',
          cov.imported < cov.total ? 'border-amber-500/30 bg-amber-500/10 text-amber-100' : 'border-zinc-800 bg-zinc-900/50 text-zinc-300'
        )}
      >
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Counts use e-Chavdi notices for {cov.imported} of these {cov.total} months
          {first ? ` (data from ${monthName(first)} to ${monthName(last)})` : ''}.
          {cov.imported < cov.total && ' Months without data are not counted, so real totals are higher.'}
        </span>
      </p>

      <div className={cn('grid gap-3', myLand.length ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2')}>
        <BigNumber value={sales.length} en="Land sales" gu="જમીન વેચાણ" />
        <BigNumber value={inSpan.length} en="All record changes" gu="કુલ ફેરફાર નોંધ" sub="Sales, loans, inheritance, orders" />
        {myLand.length > 0 && (
          <>
            <BigNumber
              value={salesNear.length}
              en="Sales near my land"
              gu="મારી જમીનની નજીક વેચાણ"
              sub={`Same original survey${nearby.radiusKm ? ` or pinned within ${nearby.radiusKm} km` : ''}`}
            />
            <BigNumber
              value={onMine.length}
              en="Notices on my land"
              gu="મારી જમીન પર નોંધ"
              sub={openOnMine.length ? `${openOnMine.length} still open for objection` : undefined}
            />
          </>
        )}
      </div>

      <Card className="p-4 md:p-5">
        <h3 className="text-lg font-semibold text-zinc-100">
          Sales each month <span className="text-zinc-400">· દર મહિને વેચાણ</span>
        </h3>
        <div className="mt-4 flex h-44 items-end gap-1" role="img" aria-label="Land sales per month">
          {perMonth.map((p) => (
            <div key={p.month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[11px] tabular-nums text-zinc-300">{p.has ? p.n : ''}</span>
              {p.has ? (
                <div className="w-full max-w-8 rounded-t bg-accent/80" style={{ height: `${Math.max(p.n ? 4 : 1, (p.n / max) * 100)}%` }} />
              ) : (
                <div className="h-full w-full max-w-8 rounded-t border border-dashed border-zinc-700" title="No data imported" />
              )}
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-1">
          {perMonth.map((p, i) => (
            <span key={p.month} className="min-w-0 flex-1 truncate text-center text-[10px] text-zinc-500">
              {span === 12 || i % 3 === 0 ? monthName(p.month, false) : ''}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs text-zinc-500">Dashed columns: no data imported for that month (માહિતી નથી).</p>
      </Card>

      <Card className="p-4 md:p-5">
        <h3 className="mb-3 text-lg font-semibold text-zinc-100">
          Latest sales <span className="text-zinc-400">· તાજેતરના વેચાણ</span>
        </h3>
        {latest.length === 0 ? (
          <p className="text-sm text-zinc-500">No sales in the imported months.</p>
        ) : (
          <ul className="divide-y divide-zinc-800/70">
            {latest.map((e) => {
              const r = relations.get(e.entryNo);
              return (
                <li key={e.entryNo} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                  <span className="tabular-nums text-zinc-400">{isoToDmy(e.date)}</span>
                  <span className="text-zinc-200">Survey {e.surveys.map((s) => s.survey).join(', ')}</span>
                  {r && (
                    <span className={cn('rounded px-1.5 py-0.5 text-xs', r.kind === 'mine' ? 'bg-amber-500/15 text-amber-300' : 'bg-accent/10 text-accent')}>
                      {r.kind === 'mine' ? 'My land' : 'Near my land'}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {watch.items.length > 0 && (
        <Card className="p-4 md:p-5">
          <h3 className="mb-3 text-lg font-semibold text-zinc-100">
            Area developments <span className="text-zinc-400">· આસપાસના વિકાસ</span>
          </h3>
          <ul className="divide-y divide-zinc-800/70">
            {sortWatchItems(watch.items)
              .slice(0, 4)
              .map((it) => (
                <li key={it.id} className="py-2 text-sm">
                  <p className="text-zinc-200">{it.title}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {isoToDmy(it.date)} · {WATCH_SCOPE_LABEL[it.scope]} ·{' '}
                    <a href={it.sources[0].url} target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-300">
                      {it.sources[0].label}
                    </a>
                  </p>
                </li>
              ))}
          </ul>
        </Card>
      )}

      <p className="text-center text-xs text-zinc-600">
        {village.en.village}, {village.en.taluka}, {village.en.district}. Source: AnyRoR e-Chavdi, Revenue Department, Government of Gujarat.
        A count of public notices, not a valuation or legal advice.
      </p>
    </div>
  );
}

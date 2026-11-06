'use client';

import { useMemo, useState } from 'react';
import { MapPin } from 'lucide-react';
import { CATEGORY_META, CATEGORY_ORDER, ChavdiEntry, EntryCategory, PinMap, RELATION_META, Relation, entryTypeInfo, objectionWindow } from '@/lib/land';
import { cn } from '@/lib/utils';

export const isoToDmy = (iso: string) => iso.split('-').reverse().join('/');

interface EntriesTableProps {
  entries: ChavdiEntry[];
  pins: PinMap;
  today: string;
  selected: string | null;
  onSelect: (survey: string) => void;
  /** How each notice relates to your land, by entry number. */
  relations?: Map<number, Relation>;
  /** Entry numbers that are new since your last visit. */
  fresh?: Set<number>;
}

const PAGE = 40;

export function EntriesTable({ entries, pins, today, selected, onSelect, relations, fresh }: EntriesTableProps) {
  const [filter, setFilter] = useState<EntryCategory | 'all'>('all');
  const [only, setOnly] = useState<'all' | 'mine' | 'new'>('all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (filter !== 'all' && entryTypeInfo(e.typeGu).category !== filter) return false;
      if (only === 'mine' && !relations?.has(e.entryNo)) return false;
      if (only === 'new' && !fresh?.has(e.entryNo)) return false;
      if (!q) return true;
      return String(e.entryNo).includes(q) || e.surveys.some((s) => s.survey.toLowerCase().startsWith(q) || s.khata === q);
    });
  }, [entries, filter, query, only, relations, fresh]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex max-w-full overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900/60 p-1" role="group" aria-label="Filter by type">
          {(['all', ...CATEGORY_ORDER] as const).map((c) => (
            <button
              key={c}
              onClick={() => {
                setFilter(c);
                setLimit(PAGE);
              }}
              aria-pressed={filter === c}
              className={cn(
                'whitespace-nowrap rounded-md px-2 py-1 text-xs transition-colors',
                filter === c ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
              )}
            >
              {c === 'all' ? 'All' : CATEGORY_META[c].label}
            </button>
          ))}
        </div>
        {(relations?.size || fresh?.size) ? (
          <div className="flex rounded-lg border border-zinc-800 bg-zinc-900/60 p-1" role="group" aria-label="Show">
            {([['all', 'All notices'], ['mine', `Mine & nearby (${relations?.size ?? 0})`], ['new', `New (${fresh?.size ?? 0})`]] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => {
                  setOnly(v);
                  setLimit(PAGE);
                }}
                aria-pressed={only === v}
                className={cn('whitespace-nowrap rounded-md px-2 py-1 text-xs', only === v ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200')}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(PAGE);
          }}
          placeholder="Survey, khata or entry no."
          aria-label="Search by survey number, khata or entry number"
          className="w-48 rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
        />
        <span className="text-xs text-zinc-500">{shown.length} notices</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-zinc-900/80 text-xs text-zinc-400">
            <tr>
              <th className="px-3 py-2 font-medium">Entry</th>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Survey nos. (khata)</th>
              <th className="px-3 py-2 font-medium" title="Estimated as entry date + 30 days; the notice counts from when it is served">
                Objection window*
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/70">
            {shown.slice(0, limit).map((e) => {
              const info = entryTypeInfo(e.typeGu);
              const w = objectionWindow(e, today);
              const rel = relations?.get(e.entryNo);
              return (
                <tr key={e.entryNo} className={cn('align-top hover:bg-zinc-900/40', rel?.kind === 'mine' && 'bg-amber-500/5')}>
                  <td className="px-3 py-2 tabular-nums text-zinc-200">
                    {e.entryNo}
                    {fresh?.has(e.entryNo) && <span className="ml-1.5 rounded bg-sky-500/15 px-1 py-0.5 text-[10px] font-medium text-sky-300">NEW</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-zinc-300">{isoToDmy(e.date)}</td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-1.5 text-zinc-200">
                      <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: CATEGORY_META[info.category].color }} />
                      {info.en}
                    </span>
                    <span className="text-xs text-zinc-500">{e.typeGu}</span>
                    {rel && (
                      <span
                        className={cn(
                          'mt-1 block w-fit rounded px-1.5 py-0.5 text-[11px]',
                          rel.kind === 'mine' ? 'bg-amber-500/15 text-amber-300' : 'bg-accent/10 text-accent'
                        )}
                        title={RELATION_META[rel.kind].label}
                      >
                        {RELATION_META[rel.kind].short} · {rel.mySurvey}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {e.surveys.map((s) => (
                        <button
                          key={s.survey}
                          onClick={() => onSelect(s.survey)}
                          className={cn(
                            'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs tabular-nums transition-colors',
                            selected === s.survey
                              ? 'border-accent/60 bg-accent/10 text-zinc-100'
                              : 'border-zinc-700 text-zinc-300 hover:border-zinc-500'
                          )}
                        >
                          {pins[s.survey] && <MapPin className="h-3 w-3 text-accent" aria-label="pinned" />}
                          {s.survey}
                          {s.khata && <span className="text-zinc-500">({s.khata})</span>}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">
                    {w.daysLeft >= 0 ? (
                      <span className="text-amber-400">≈ {w.daysLeft} days left</span>
                    ) : (
                      <span className="text-zinc-500">closed ≈ {isoToDmy(w.closes)}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {shown.length > limit && (
        <button onClick={() => setLimit((l) => l + PAGE)} className="mt-3 text-xs text-zinc-400 underline hover:text-zinc-200">
          Show {Math.min(PAGE, shown.length - limit)} more
        </button>
      )}
      <p className="mt-2 text-xs text-zinc-500">
        * The notice invites written objections within 30 days of the notice reaching the holder. Only the entry date is public here,
        so the window is an estimate; the Mamlatdar office has the actual dates.
      </p>
    </div>
  );
}

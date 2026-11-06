'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CATEGORY_META, CATEGORY_ORDER, MonthRow } from '@/lib/land';
import { cn } from '@/lib/utils';
import { Lang, useLang, useT } from '@/lib/i18n';

const MONTHS = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  gu: ['જાન્યુ', 'ફેબ્રુ', 'માર્ચ', 'એપ્રિલ', 'મે', 'જૂન', 'જુલાઈ', 'ઑગસ્ટ', 'સપ્ટે', 'ઑક્ટો', 'નવે', 'ડિસે'],
};

export function monthName(ym: string, withYear = true, lang: Lang = 'en') {
  const [y, m] = ym.split('-');
  const name = MONTHS[lang][Number(m) - 1];
  return withYear ? `${name} ${y}` : name;
}

function TooltipBody({ active, payload }: { active?: boolean; payload?: { payload: MonthRow }[] }) {
  const lang = useLang();
  const t = useT();
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-zinc-100">{monthName(row.month, true, lang)}</p>
      {!row.imported ? (
        <p className="text-zinc-400">{t('Not imported yet', 'હજુ ઉમેર્યું નથી')}</p>
      ) : row.total === 0 ? (
        <p className="text-zinc-400">{t('Imported, no notices', 'ઉમેર્યું, કોઈ નોંધ નથી')}</p>
      ) : (
        <ul className="space-y-0.5">
          {CATEGORY_ORDER.filter((c) => row[c] > 0).map((c) => (
            <li key={c} className="flex items-center gap-2 text-zinc-300">
              <span className="h-2 w-2 rounded-sm" style={{ background: CATEGORY_META[c].color }} />
              {t(CATEGORY_META[c].label, CATEGORY_META[c].gu)}
              <span className="ml-auto pl-3 tabular-nums text-zinc-100">{row[c]}</span>
            </li>
          ))}
          <li className="flex justify-between border-t border-zinc-800 pt-1 text-zinc-400">
            {t('Total', 'કુલ')} <span className="tabular-nums text-zinc-100">{row.total}</span>
          </li>
        </ul>
      )}
    </div>
  );
}

export function ActivityChart({ rows }: { rows: MonthRow[] }) {
  const lang = useLang();
  const t = useT();
  const imported = rows.filter((r) => r.imported).length;
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400" aria-label={t('Legend', 'સંકેત')}>
        {CATEGORY_ORDER.map((c) => (
          <span key={c} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CATEGORY_META[c].color }} />
            {t(CATEGORY_META[c].label, CATEGORY_META[c].gu)}
          </span>
        ))}
      </div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -20 }} barCategoryGap="18%">
            <CartesianGrid vertical={false} stroke="#27272a" />
            <XAxis
              dataKey="month"
              tickFormatter={(m: string) => (m.endsWith('-01') ? monthName(m, true, lang) : monthName(m, false, lang))}
              tick={{ fill: '#71717a', fontSize: 11 }}
              axisLine={{ stroke: '#3f3f46' }}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={8}
            />
            <YAxis allowDecimals={false} tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip content={<TooltipBody />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            {CATEGORY_ORDER.map((c) => (
              <Bar key={c} dataKey={c} stackId="a" fill={CATEGORY_META[c].color} stroke="#09090b" strokeWidth={1} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Which of the 24 months have been imported. */}
      <div className="mt-3">
        <div className="flex gap-0.5" aria-label={t(`${imported} of ${rows.length} months imported`, `${rows.length}માંથી ${imported} મહિના ઉમેર્યા`)}>
          {rows.map((r) => (
            <span
              key={r.month}
              title={`${monthName(r.month, true, lang)}: ${r.imported ? t('imported', 'ઉમેર્યું') : t('not imported', 'ઉમેર્યું નથી')}`}
              className={cn('h-1.5 flex-1 rounded-full', r.imported ? 'bg-accent/70' : 'bg-zinc-800')}
            />
          ))}
        </div>
        <p className="mt-1.5 text-xs text-zinc-500">
          {t(
            `${imported} of ${rows.length} months imported. Empty months are gaps in the data, not quiet months.`,
            `${rows.length}માંથી ${imported} મહિના ઉમેર્યા છે. ખાલી મહિના એટલે માહિતી નથી, એ મહિને સોદા નહોતા એવું નહીં.`
          )}
        </p>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { FileUp, ClipboardPaste } from 'lucide-react';
import { ParsedPage, parseChavdiPage } from '@/lib/land';
import { monthName } from './ActivityChart';
import { Lang, useLang, useT } from '@/lib/i18n';

interface ImportPanelProps {
  /** Returns a message per page, or throws with a reason. */
  onImport: (pages: ParsedPage[]) => string;
}

/** Month from a file name ending in -YYYY-MM.html, for pages that list no entries. */
function monthFromName(name: string): string | null {
  const m = name.match(/-(\d{4})-(\d{2})\.html?$/i);
  return m ? `${m[1]}-${m[2]}` : null;
}

function describe(p: ParsedPage, name: string, lang: Lang) {
  const months = p.months.map((m) => monthName(m, true, lang)).join(', ') || (lang === 'gu' ? 'મહિનો ખબર નથી' : 'month unknown');
  return lang === 'gu' ? `${name}: ${p.entries.length} નોંધ (${months})` : `${name}: ${p.entries.length} entries (${months})`;
}

export function ImportPanel({ onImport }: ImportPanelProps) {
  const [paste, setPaste] = useState('');
  const [log, setLog] = useState<{ ok: boolean; text: string }[]>([]);
  const lang = useLang();
  const t = useT();

  function run(inputs: { name: string; html: string }[]) {
    const lines: { ok: boolean; text: string }[] = [];
    const pages: ParsedPage[] = [];
    for (const { name, html } of inputs) {
      try {
        const page = parseChavdiPage(html);
        const fromName = monthFromName(name);
        if (fromName && !page.months.includes(fromName)) page.months = [...page.months, fromName].sort();
        if (page.months.length === 0) {
          lines.push({
            ok: false,
            text: t(
              `${name}: no entries and no month in the file name (…-YYYY-MM.html), so it was skipped.`,
              `${name}: કોઈ નોંધ નથી અને ફાઇલના નામમાં મહિનો નથી (…-YYYY-MM.html), એટલે છોડી દીધી.`
            ),
          });
          continue;
        }
        pages.push(page);
        lines.push({ ok: true, text: describe(page, name, lang) });
      } catch (e) {
        lines.push({ ok: false, text: `${name}: ${(e as Error).message}` });
      }
    }
    if (pages.length) {
      try {
        lines.push({ ok: true, text: onImport(pages) });
      } catch (e) {
        lines.push({ ok: false, text: (e as Error).message });
      }
    }
    setLog(lines);
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    run(await Promise.all([...files].map(async (f) => ({ name: f.name, html: await f.text() }))));
  }

  return (
    <div className="space-y-4 text-sm">
      <ol className="list-decimal space-y-1 pl-5 text-zinc-400">
        <li>
          <a href="https://anyror.gujarat.gov.in/LandRecordRural.aspx" target="_blank" rel="noopener noreferrer" className="text-zinc-200 underline hover:text-accent">
            {t('AnyRoR rural land record', 'AnyRoR ગ્રામ્ય જમીન રેકર્ડ')}
          </a>{' '}
          {t(
            ': choose e-CHAVDI, the village, a year and month, solve the CAPTCHA and open the result.',
            'પર e-CHAVDI, ગામ, વર્ષ અને મહિનો પસંદ કરો, CAPTCHA ભરો અને પરિણામ ખોલો.'
          )}
        </li>
        <li>{t('Save the result page (Ctrl+S, “Webpage, HTML only”), or copy its page source.', 'પરિણામનું પાનું સાચવો (Ctrl+S, “Webpage, HTML only”), અથવા તેનો page source કૉપી કરો.')}</li>
        <li>{t('Drop the saved files here, or paste the source below. Repeat for each month you want.', 'સાચવેલી ફાઇલો અહીં ઉમેરો, અથવા નીચે source પેસ્ટ કરો. દરેક મહિના માટે આમ કરો.')}</li>
      </ol>
      <p className="text-xs text-zinc-500">
        {t('Collecting many months?', 'ઘણા મહિના ભેગા કરવા છે?')} <code className="text-zinc-400">scripts/collect_echavdi.py</code>{' '}
        {t(
          'opens a browser and saves each result page while you fill the form. You still solve every CAPTCHA yourself.',
          'બ્રાઉઝર ખોલે છે અને તમે ફોર્મ ભરો તેમ દરેક પાનું સાચવે છે. દરેક CAPTCHA તમારે જાતે ભરવાનો રહે છે.'
        )}
      </p>

      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-700 px-4 py-5 text-zinc-300 hover:border-accent/50 hover:text-zinc-100">
        <FileUp className="h-4 w-4" />
        {t('Choose saved e-Chavdi pages (.html)', 'સાચવેલાં ઈ-ચાવડી પાનાં પસંદ કરો (.html)')}
        <input type="file" accept=".html,.htm,text/html" multiple className="sr-only" onChange={(e) => onFiles(e.target.files)} />
      </label>

      <div>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder={t('…or paste the page source of an InfoChavdiNoticeView.aspx result here', '…અથવા InfoChavdiNoticeView.aspx પરિણામનો page source અહીં પેસ્ટ કરો')}
          className="h-24 w-full resize-y rounded-lg border border-zinc-800 bg-zinc-950 p-2 font-mono text-xs text-zinc-300 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
        />
        <button
          onClick={() => {
            run([{ name: t('Pasted page', 'પેસ્ટ કરેલું પાનું'), html: paste }]);
            setPaste('');
          }}
          disabled={!paste.trim()}
          className="mt-2 inline-flex items-center gap-2 rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-100 hover:bg-zinc-700 disabled:opacity-40"
        >
          <ClipboardPaste className="h-3.5 w-3.5" />
          {t('Import pasted page', 'પેસ્ટ કરેલું પાનું ઉમેરો')}
        </button>
      </div>

      {log.length > 0 && (
        <ul className="space-y-1 text-xs" aria-live="polite">
          {log.map((l, i) => (
            <li key={i} className={l.ok ? 'text-emerald-400' : 'text-rose-400'}>
              {l.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

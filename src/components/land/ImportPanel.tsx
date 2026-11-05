'use client';

import { useState } from 'react';
import { FileUp, ClipboardPaste } from 'lucide-react';
import { ParsedPage, parseChavdiPage } from '@/lib/land';
import { monthName } from './ActivityChart';

interface ImportPanelProps {
  /** Returns a message per page, or throws with a reason. */
  onImport: (pages: ParsedPage[]) => string;
}

/** Month from a file name ending in -YYYY-MM.html, for pages that list no entries. */
function monthFromName(name: string): string | null {
  const m = name.match(/-(\d{4})-(\d{2})\.html?$/i);
  return m ? `${m[1]}-${m[2]}` : null;
}

function describe(p: ParsedPage, name: string) {
  const months = p.months.map((m) => monthName(m)).join(', ') || 'month unknown';
  return `${name}: ${p.entries.length} entries (${months})`;
}

export function ImportPanel({ onImport }: ImportPanelProps) {
  const [paste, setPaste] = useState('');
  const [log, setLog] = useState<{ ok: boolean; text: string }[]>([]);

  function run(inputs: { name: string; html: string }[]) {
    const lines: { ok: boolean; text: string }[] = [];
    const pages: ParsedPage[] = [];
    for (const { name, html } of inputs) {
      try {
        const page = parseChavdiPage(html);
        const fromName = monthFromName(name);
        if (fromName && !page.months.includes(fromName)) page.months = [...page.months, fromName].sort();
        if (page.months.length === 0) {
          lines.push({ ok: false, text: `${name}: no entries and no month in the file name (…-YYYY-MM.html), so it was skipped.` });
          continue;
        }
        pages.push(page);
        lines.push({ ok: true, text: describe(page, name) });
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
          On{' '}
          <a href="https://anyror.gujarat.gov.in/LandRecordRural.aspx" target="_blank" rel="noopener noreferrer" className="text-zinc-200 underline hover:text-accent">
            AnyRoR rural land record
          </a>{' '}
          choose e-CHAVDI, the village, a year and month, solve the CAPTCHA and open the result.
        </li>
        <li>Save the result page (Ctrl+S, &ldquo;Webpage, HTML only&rdquo;), or copy its page source.</li>
        <li>Drop the saved files here, or paste the source below. Repeat for each month you want.</li>
      </ol>
      <p className="text-xs text-zinc-500">
        Collecting many months? <code className="text-zinc-400">scripts/collect_echavdi.py</code> opens a browser and saves each result
        page while you fill the form. You still solve every CAPTCHA yourself.
      </p>

      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-700 px-4 py-5 text-zinc-300 hover:border-accent/50 hover:text-zinc-100">
        <FileUp className="h-4 w-4" />
        Choose saved e-Chavdi pages (.html)
        <input type="file" accept=".html,.htm,text/html" multiple className="sr-only" onChange={(e) => onFiles(e.target.files)} />
      </label>

      <div>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder="…or paste the page source of an InfoChavdiNoticeView.aspx result here"
          className="h-24 w-full resize-y rounded-lg border border-zinc-800 bg-zinc-950 p-2 font-mono text-xs text-zinc-300 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
        />
        <button
          onClick={() => {
            run([{ name: 'Pasted page', html: paste }]);
            setPaste('');
          }}
          disabled={!paste.trim()}
          className="mt-2 inline-flex items-center gap-2 rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-100 hover:bg-zinc-700 disabled:opacity-40"
        >
          <ClipboardPaste className="h-3.5 w-3.5" />
          Import pasted page
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

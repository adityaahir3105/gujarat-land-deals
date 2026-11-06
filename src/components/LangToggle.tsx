'use client';

import { useEffect } from 'react';
import { setLang, useLang } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/** English / ગુજરાતી switch for the header. */
export function LangToggle() {
  const lang = useLang();
  // Keep <html lang> in step with the saved choice (also after a reload).
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return (
    <div className="flex rounded-md border border-zinc-800 p-0.5" role="group" aria-label="Language / ભાષા">
      {(
        [
          ['en', 'EN'],
          ['gu', 'ગુજ'],
        ] as const
      ).map(([l, label]) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          lang={l}
          title={l === 'en' ? 'English' : 'ગુજરાતી'}
          className={cn('rounded px-2 py-1 text-xs', lang === l ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200')}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Text for server-rendered pages: English first, the chosen language after hydration. */
export function T({ en, gu }: { en: string; gu: string }) {
  return <>{useLang() === 'gu' ? gu : en}</>;
}

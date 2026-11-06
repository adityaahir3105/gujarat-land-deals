'use client';

import { Eye, EyeOff, Lock, Trash2 } from 'lucide-react';
import type { ShapeLayer } from '@/lib/geo';
import { useT } from '@/lib/i18n';

const btn =
  'inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100';

interface Props {
  layers: ShapeLayer[];
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}

/** Files imported with "Import KML / pins": their outlines, lines and points. */
export function ImportedShapes({ layers, onToggle, onRemove }: Props) {
  const t = useT();
  if (!layers.length) return null;
  return (
    <div className="mt-4 rounded-lg border border-zinc-800 p-3">
      <h4 className="text-sm font-medium text-zinc-200">{t('Imported shapes', 'ઉમેરેલા આકાર')}</h4>
      <p className="flex items-center gap-1 text-xs text-zinc-500">
        <Lock className="h-3 w-3" /> {t('Stored only in this browser. Gold outlines are your own survey numbers.', 'ફક્ત આ બ્રાઉઝરમાં સાચવેલું. સોનેરી રેખા તમારા પોતાના સર્વે નંબર છે.')}
      </p>
      <ul className="mt-2 space-y-2">
        {layers.map((l) => {
          const surveys = [...new Set(l.shapes.map((s) => s.survey).filter(Boolean))];
          return (
            <li key={l.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-zinc-200" title={l.name}>
                {l.name}
              </span>
              <span className="text-xs text-zinc-500">
                {t(`${l.shapes.length} shape${l.shapes.length === 1 ? '' : 's'}`, `${l.shapes.length} આકાર`)}
                {surveys.length ? ` · ${t('survey', 'સર્વે')} ${surveys.join(', ')}` : ''}
              </span>
              <button className={btn} onClick={() => onToggle(l.id)} aria-label={l.visible ? t(`Hide ${l.name}`, `${l.name} છુપાવો`) : t(`Show ${l.name}`, `${l.name} બતાવો`)}>
                {l.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              </button>
              <button className={btn} onClick={() => onRemove(l.id)} aria-label={t(`Remove ${l.name}`, `${l.name} કાઢો`)}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

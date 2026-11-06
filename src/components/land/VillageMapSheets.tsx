'use client';

import { useRef, useState } from 'react';
import { Eye, EyeOff, Lock, Minus, Plus, Trash2, Upload, Waypoints } from 'lucide-react';
import type { OverlaySheet, XY } from '@/lib/overlay';
import { cn } from '@/lib/utils';

export type ViewSheet = OverlaySheet & { url: string };

export interface AlignState {
  id: string;
  img: XY[];
  geo: { lat: number; lng: number }[];
}

interface Props {
  sheets: ViewSheet[];
  align: AlignState | null;
  notice: string | null;
  onUpload: (files: FileList) => void;
  onToggle: (id: string) => void;
  onOpacity: (id: string, opacity: number) => void;
  onRemove: (id: string) => void;
  onStartAlign: (id: string) => void;
  onCancelAlign: () => void;
  onPickImage: (p: XY) => void;
}

const btn =
  'inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100';

export function VillageMapSheets({ sheets, align, notice, onUpload, onToggle, onOpacity, onRemove, onStartAlign, onCancelAlign, onPickImage }: Props) {
  const aligning = align ? sheets.find((s) => s.id === align.id) : undefined;

  return (
    <div className="mt-4 rounded-lg border border-zinc-800 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-medium text-zinc-200">Village map sheets</h4>
          <p className="flex items-center gap-1 text-xs text-zinc-500">
            <Lock className="h-3 w-3" /> Stored only in this browser. Not part of the public site.
          </p>
        </div>
        <label className={cn(btn, 'cursor-pointer')}>
          <Upload className="h-3.5 w-3.5" /> Add scan (PNG/JPG)
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            className="sr-only"
            onChange={(e) => {
              if (e.target.files?.length) onUpload(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
      </div>

      {sheets.length === 0 && (
        <p className="mt-2 text-xs text-zinc-400">
          Add a scan of the village map (gam nakasho), then line it up with the satellite view by clicking three matching places. Use the
          sharpest copy you have: survey numbers must be readable when zoomed in.
        </p>
      )}

      <ul className="mt-3 space-y-2">
        {sheets.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate text-zinc-200" title={s.name}>
              {s.name}
            </span>
            <span className={cn('text-xs', s.points.length === 3 ? 'text-emerald-400' : 'text-amber-400')}>
              {s.points.length === 3 ? 'aligned' : 'not aligned'}
            </span>
            {s.points.length === 3 && (
              <>
                <button className={btn} onClick={() => onToggle(s.id)} aria-label={s.visible ? 'Hide sheet' : 'Show sheet'}>
                  {s.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
                <label className="flex items-center gap-1 text-xs text-zinc-400">
                  Opacity
                  <input
                    type="range"
                    min={0.15}
                    max={1}
                    step={0.05}
                    value={s.opacity}
                    onChange={(e) => onOpacity(s.id, Number(e.target.value))}
                    className="w-24 accent-[#FFD700]"
                  />
                </label>
              </>
            )}
            <button className={btn} onClick={() => (align?.id === s.id ? onCancelAlign() : onStartAlign(s.id))}>
              <Waypoints className="h-3.5 w-3.5" /> {align?.id === s.id ? 'Cancel' : s.points.length === 3 ? 'Re-align' : 'Align'}
            </button>
            <button className={btn} onClick={() => onRemove(s.id)} aria-label={`Remove ${s.name}`}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>

      {notice && <p className="mt-2 text-xs text-amber-300">{notice}</p>}

      {align && aligning && <Aligner sheet={aligning} align={align} onPickImage={onPickImage} />}
    </div>
  );
}

function Aligner({ sheet, align, onPickImage }: { sheet: ViewSheet; align: AlignState; onPickImage: (p: XY) => void }) {
  const [zoom, setZoom] = useState(1);
  const imgRef = useRef<HTMLImageElement>(null);
  const n = align.img.length;
  const waitingForMap = align.img.length > align.geo.length;
  const step = waitingForMap ? n : n + 1;

  return (
    <div className="mt-3 border-t border-zinc-800 pt-3">
      <p className="text-sm text-sky-200">
        Point {step} of 3:{' '}
        {waitingForMap ? 'now click the same place on the satellite map above.' : 'click a place on the scan that you can also find on the satellite map.'}
      </p>
      <p className="mt-1 text-xs text-zinc-500">
        Good points: where the highway or railway crosses the village boundary, a canal or road junction, a sharp boundary corner. Spread
        the three far apart, like a big triangle.
      </p>
      <div className="mt-2 flex gap-2">
        <button className={btn} onClick={() => setZoom((z) => Math.max(1, z / 1.5))} aria-label="Zoom out scan">
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button className={btn} onClick={() => setZoom((z) => Math.min(8, z * 1.5))} aria-label="Zoom in scan">
          <Plus className="h-3.5 w-3.5" />
        </button>
        <span className="self-center text-xs text-zinc-500">{Math.round(zoom * 100)}%</span>
      </div>
      <div className="mt-2 h-[420px] overflow-auto rounded-md border border-zinc-800 bg-white">
        <div className="relative" style={{ width: `${zoom * 100}%` }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
          <img
            ref={imgRef}
            src={sheet.url}
            alt={`Scan: ${sheet.name}`}
            className={cn('block w-full select-none', waitingForMap ? 'cursor-not-allowed opacity-80' : 'cursor-crosshair')}
            draggable={false}
            onClick={(e) => {
              if (waitingForMap || !imgRef.current) return;
              const r = imgRef.current.getBoundingClientRect();
              onPickImage({
                x: ((e.clientX - r.left) / r.width) * sheet.width,
                y: ((e.clientY - r.top) / r.height) * sheet.height,
              });
            }}
          />
          {align.img.map((p, i) => (
            <span
              key={i}
              className="pointer-events-none absolute flex h-[22px] w-[22px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-zinc-950 bg-sky-400 text-xs font-semibold text-zinc-950"
              style={{ left: `${(p.x / sheet.width) * 100}%`, top: `${(p.y / sheet.height) * 100}%` }}
            >
              {i + 1}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

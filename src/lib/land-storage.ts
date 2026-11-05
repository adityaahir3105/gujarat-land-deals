// Browser-only persistence for the land dashboard: imported e-Chavdi pages, survey pins and a
// corrected village centre. Lives in this browser's localStorage only; export to keep or share.

import { LandDataset, PinMap, VillageKey, villageId } from './land';

const PREFIX = 'landdeals.v1';

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // private mode, quota, blocked storage
  }
}

const k = (kind: string, v: VillageKey) => `${PREFIX}.${kind}.${villageId(v)}`;

export const landStorage = {
  loadImports: (v: VillageKey) => read<LandDataset>(k('imports', v)),
  saveImports: (v: VillageKey, d: LandDataset | null) => write(k('imports', v), d),
  loadPins: (v: VillageKey) => read<PinMap>(k('pins', v)) ?? {},
  savePins: (v: VillageKey, p: PinMap) => write(k('pins', v), p),
  loadCenter: (v: VillageKey) => read<{ lat: number; lng: number }>(k('center', v)),
  saveCenter: (v: VillageKey, c: { lat: number; lng: number } | null) => write(k('center', v), c),
};

export function downloadText(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

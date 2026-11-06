// Browser-only persistence for the land dashboard: imported e-Chavdi pages, survey pins, a
// corrected village centre, the land you watch, shapes imported from Google Earth and what you
// have already seen. Lives in this
// browser's localStorage only, so "my land" never reaches the public site; back it up to move it.

import type { ShapeLayer } from './geo';
import { LandDataset, PinMap, VillageKey, villageId } from './land';

export interface NearbySettings {
  radiusKm: number;
  numberWindow: number;
}

export const DEFAULT_NEARBY: NearbySettings = { radiusKm: 1, numberWindow: 10 };

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
  loadMyLand: (v: VillageKey) => read<string[]>(k('myland', v)) ?? [],
  saveMyLand: (v: VillageKey, surveys: string[]) => write(k('myland', v), surveys),
  loadNearby: (v: VillageKey) => ({ ...DEFAULT_NEARBY, ...(read<Partial<NearbySettings>>(k('nearby', v)) ?? {}) }),
  saveNearby: (v: VillageKey, n: NearbySettings) => write(k('nearby', v), n),
  /** Entry numbers present at the end of the previous visit; null on a first visit. */
  loadSeen: (v: VillageKey) => read<number[]>(k('seen', v)),
  saveSeen: (v: VillageKey, entryNos: number[]) => write(k('seen', v), entryNos),
  /** Area-watch item ids present at the end of the previous visit; null on a first visit. */
  loadSeenWatch: (v: VillageKey) => read<string[]>(k('seenwatch', v)),
  saveSeenWatch: (v: VillageKey, ids: string[]) => write(k('seenwatch', v), ids),
  /** Shapes imported from KML/KMZ files (private, like "my land"). */
  loadShapes: (v: VillageKey) => read<ShapeLayer[]>(k('shapes', v)) ?? [],
  saveShapes: (v: VillageKey, layers: ShapeLayer[]) => write(k('shapes', v), layers),
};

/** Everything personal for one village, for moving between devices. */
export interface Backup {
  kind: 'land-deals-backup';
  version: 1;
  village: VillageKey;
  myLand: string[];
  pins: PinMap;
  center: { lat: number; lng: number } | null;
  nearby: NearbySettings;
  imports: LandDataset | null;
  /** Village map sheets with their alignment, images as data URLs (optional; added later). */
  overlays?: BackupOverlay[];
  /** Shapes imported from KML/KMZ files (optional; added later). */
  shapes?: ShapeLayer[];
}

export interface BackupOverlay {
  id: string;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  points: { img: { x: number; y: number }; geo: { lat: number; lng: number } }[];
  opacity: number;
  visible: boolean;
  added: string;
}

export function makeBackup(v: VillageKey): Backup {
  return {
    kind: 'land-deals-backup',
    version: 1,
    village: { district: v.district, taluka: v.taluka, village: v.village },
    myLand: landStorage.loadMyLand(v),
    pins: landStorage.loadPins(v),
    center: landStorage.loadCenter(v),
    nearby: landStorage.loadNearby(v),
    imports: landStorage.loadImports(v),
    shapes: landStorage.loadShapes(v),
  };
}

/** Restores a backup over this browser's settings for the same village. Throws on a bad file. */
export function restoreBackup(v: VillageKey, text: string): Backup {
  let b: Backup;
  try {
    b = JSON.parse(text) as Backup;
  } catch {
    throw new Error('This is not a Land Deals backup file.');
  }
  if (b?.kind !== 'land-deals-backup' || b.version !== 1) throw new Error('This is not a Land Deals backup file.');
  if (villageId(b.village) !== villageId(v)) throw new Error(`This backup is for ${b.village.village}, not ${v.village}.`);
  landStorage.saveMyLand(v, Array.isArray(b.myLand) ? b.myLand.map(String) : []);
  landStorage.savePins(v, b.pins ?? {});
  landStorage.saveCenter(v, b.center ?? null);
  landStorage.saveNearby(v, { ...DEFAULT_NEARBY, ...b.nearby });
  landStorage.saveImports(v, b.imports ?? null);
  if (Array.isArray(b.shapes)) landStorage.saveShapes(v, b.shapes);
  return b;
}

export function downloadText(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

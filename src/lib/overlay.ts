// Village map overlay: a scanned village map (gam nakasho) laid over the satellite map.
// The scan is aligned with three control points (a spot on the scan + the same spot on the
// satellite map), which fixes position, scale, rotation and skew (an affine fit). Old hand-drawn
// sheets are not perfectly to scale, so expect some local error; pick points far apart.
//
// Sheets are private: stored in this browser's IndexedDB (too large for localStorage), never in
// the repository or the public build.

import type { VillageKey } from './land';
import { villageId } from './land';

export interface XY {
  x: number;
  y: number;
}

export interface ControlPoint {
  /** Pixel on the scan, in natural image coordinates. */
  img: XY;
  geo: { lat: number; lng: number };
}

export interface OverlaySheet {
  id: string;
  /** villageId() of the village it belongs to. */
  village: string;
  name: string;
  image: Blob;
  width: number;
  height: number;
  /** Exactly three when aligned. */
  points: ControlPoint[];
  opacity: number;
  visible: boolean;
  added: string;
}

/** CSS matrix(a, b, c, d, e, f): X = a·x + c·y + e, Y = b·x + d·y + f. */
export type Affine = [number, number, number, number, number, number];

/**
 * Affine transform taking three source points onto three destination points.
 * Returns null when the source points are (nearly) on one line.
 */
export function solveAffine(src: [XY, XY, XY], dst: [XY, XY, XY]): Affine | null {
  const [p0, p1, p2] = src;
  const det = p0.x * (p1.y - p2.y) - p0.y * (p1.x - p2.x) + (p1.x * p2.y - p2.x * p1.y);
  const span = Math.max(Math.abs(p1.x - p0.x), Math.abs(p2.x - p0.x), Math.abs(p1.y - p0.y), Math.abs(p2.y - p0.y), 1);
  if (Math.abs(det) < 1e-6 * span * span) return null;
  // Solve [x y 1] · [u v w]ᵀ = target, for X and Y separately (Cramer's rule).
  const solve = (t0: number, t1: number, t2: number): [number, number, number] => {
    const u = (t0 * (p1.y - p2.y) - p0.y * (t1 - t2) + (t1 * p2.y - t2 * p1.y)) / det;
    const v = (p0.x * (t1 - t2) - t0 * (p1.x - p2.x) + (p1.x * t2 - p2.x * t1)) / det;
    const w = (p0.x * (p1.y * t2 - p2.y * t1) - p0.y * (p1.x * t2 - p2.x * t1) + t0 * (p1.x * p2.y - p2.x * p1.y)) / det;
    return [u, v, w];
  };
  const [a, c, e] = solve(dst[0].x, dst[1].x, dst[2].x);
  const [b, d, f] = solve(dst[0].y, dst[1].y, dst[2].y);
  return [a, b, c, d, e, f];
}

export function applyAffine(m: Affine, p: XY): XY {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

/** Smallest triangle angle in degrees; thin triangles align poorly. */
export function minAngleDeg(pts: [XY, XY, XY]): number {
  const ang = (a: XY, b: XY, c: XY) => {
    const v1 = { x: b.x - a.x, y: b.y - a.y };
    const v2 = { x: c.x - a.x, y: c.y - a.y };
    const cos = (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1);
    return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
  };
  return Math.min(ang(pts[0], pts[1], pts[2]), ang(pts[1], pts[2], pts[0]), ang(pts[2], pts[0], pts[1]));
}

// ---------------------------------------------------------------------------
// IndexedDB storage
// ---------------------------------------------------------------------------

const DB = 'landdeals';
const STORE = 'overlays';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

export const overlayStore = {
  async list(v: VillageKey): Promise<OverlaySheet[]> {
    const all = await tx<OverlaySheet[]>('readonly', (s) => s.getAll() as IDBRequest<OverlaySheet[]>);
    return all.filter((o) => o.village === villageId(v)).sort((a, b) => a.added.localeCompare(b.added));
  },
  put: (o: OverlaySheet) => tx('readwrite', (s) => s.put(o)),
  remove: (id: string) => tx('readwrite', (s) => s.delete(id)),
};

/** Reads an image file's natural size. */
export function imageSize(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This file is not an image the browser can open. Use a PNG or JPG (export a PDF page as an image first).'));
    };
    img.src = url;
  });
}

// For backups: sheets travel as data URLs.
export function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}

export async function dataUrlToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob();
}

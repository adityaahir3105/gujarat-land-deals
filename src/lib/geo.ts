// Map shapes: public village outlines (src/data/land/boundaries.json) and shapes a person imports
// from Google Earth (KML or KMZ). Imported shapes are private: they live in this browser's
// localStorage with "my land" and never reach the repository or the public build.

import type { PinMap } from './land';
import { surveyFromName } from './land';

// ---------------------------------------------------------------------------
// Public village outlines (built by scripts/build_boundaries.mjs)
// ---------------------------------------------------------------------------

export interface BoundaryFeature {
  type: 'Feature';
  properties: {
    name: string;
    /** "Village" or "Town". */
    kind: string;
    subDistrict: string;
    district: string;
    census2001: string;
    role: 'village' | 'neighbour';
    /** Neighbours only: shares a border with the village. */
    touches?: boolean;
  };
  geometry: { type: 'Polygon'; coordinates: number[][][] } | { type: 'MultiPolygon'; coordinates: number[][][][] };
}

export interface BoundaryCollection {
  type: 'FeatureCollection';
  features: BoundaryFeature[];
}

export interface BoundaryFile {
  source: string;
  sourceUrl: string;
  license: string;
  attribution: string;
  caveat: string;
  villages: Record<string, BoundaryCollection>;
}

/** Outer rings as [lng, lat] pairs (GeoJSON order). */
export function outerRings(f: BoundaryFeature): number[][][] {
  return f.geometry.type === 'Polygon' ? [f.geometry.coordinates[0]] : f.geometry.coordinates.map((p) => p[0]);
}

/** Ray casting; ring as [lng, lat] pairs. */
export function insideRing(pt: { lat: number; lng: number }, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > pt.lat !== yj > pt.lat && pt.lng < ((xj - xi) * (pt.lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Area-weighted centre of a ring ([lng, lat] pairs); falls back to the vertex average. */
export function ringCentroid(ring: number[][]): { lat: number; lng: number } {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += cross;
    cx += (ring[j][0] + ring[i][0]) * cross;
    cy += (ring[j][1] + ring[i][1]) * cross;
  }
  if (Math.abs(a) < 1e-14) {
    const n = ring.length || 1;
    return { lng: ring.reduce((s, p) => s + p[0], 0) / n, lat: ring.reduce((s, p) => s + p[1], 0) / n };
  }
  return { lng: cx / (3 * a), lat: cy / (3 * a) };
}

/** "Moti Chirai village boundary" and "Chirai Moti" give the same key. */
export function placeKey(name: string): string {
  const stop = new Set(['village', 'boundary', 'town', 'gam', 'the', 'm', 'ct', 'og']);
  return name
    .toLowerCase()
    .replace(/[^a-z઀-૿]+/g, ' ')
    .split(' ')
    .filter((w) => w && !stop.has(w))
    .sort()
    .join(' ');
}

// ---------------------------------------------------------------------------
// Imported shapes (KML / KMZ from Google Earth)
// ---------------------------------------------------------------------------

export interface MapShape {
  name: string;
  /** Survey number read from the name, when there is one. */
  survey?: string;
  type: 'point' | 'line' | 'polygon';
  /** [lat, lng] pairs; polygons are the outer ring only. */
  coords: [number, number][];
}

/** One imported file. */
export interface ShapeLayer {
  id: string;
  name: string;
  added: string;
  visible: boolean;
  shapes: MapShape[];
}

interface RawPlacemark {
  name: string;
  type: MapShape['type'];
  /** [lng, lat] pairs. */
  coords: number[][];
}

/** Text of a .kml file, or of the main .kml inside a .kmz (a zip). */
export async function readKmlFile(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  const head = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
  const isZip = head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
  return isZip ? unzipKml(buf) : new TextDecoder().decode(buf);
}

async function unzipKml(buf: ArrayBuffer): Promise<string> {
  const v = new DataView(buf);
  const u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('This KMZ file looks damaged.');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const entries: { name: string; method: number; size: number; local: number }[] = [];
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('This KMZ file looks damaged.');
    const nameLen = v.getUint16(p + 28, true);
    entries.push({
      method: v.getUint16(p + 10, true),
      size: v.getUint32(p + 20, true),
      local: v.getUint32(p + 42, true),
      name: new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nameLen)),
    });
    p += 46 + nameLen + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
  }
  const e = entries.find((x) => /(^|\/)doc\.kml$/i.test(x.name)) ?? entries.find((x) => /\.kml$/i.test(x.name));
  if (!e) throw new Error('No .kml file inside this KMZ.');
  const start = e.local + 30 + v.getUint16(e.local + 26, true) + v.getUint16(e.local + 28, true);
  const data = u8.slice(start, start + e.size);
  if (e.method === 0) return new TextDecoder().decode(data);
  if (e.method !== 8 || typeof DecompressionStream === 'undefined') {
    throw new Error('This browser cannot open this KMZ. Open it in Google Earth and save it as KML instead.');
  }
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

function parseCoords(text: string | null | undefined): number[][] {
  return (text ?? '')
    .trim()
    .split(/\s+/)
    .map((t) => t.split(',').map(Number))
    .filter((c) => c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]) && Math.abs(c[1]) <= 90 && Math.abs(c[0]) <= 180)
    .map((c) => [c[0], c[1]]);
}

const byName = (el: Element | Document, tag: string) => Array.from(el.getElementsByTagNameNS('*', tag));

/** Placemarks (points, lines, polygon outer rings) and the number of image overlays in a KML text. */
export function parseKml(text: string): { placemarks: RawPlacemark[]; imageOverlays: number } {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length || doc.documentElement.localName !== 'kml') {
    throw new Error('This is not a KML file.');
  }
  const placemarks: RawPlacemark[] = [];
  for (const pm of byName(doc, 'Placemark')) {
    const name = Array.from(pm.children).find((c) => c.localName === 'name')?.textContent?.trim() ?? '';
    for (const g of byName(pm, 'Point')) placemarks.push({ name, type: 'point', coords: parseCoords(byName(g, 'coordinates')[0]?.textContent).slice(0, 1) });
    for (const g of byName(pm, 'LineString')) placemarks.push({ name, type: 'line', coords: parseCoords(byName(g, 'coordinates')[0]?.textContent) });
    for (const g of byName(pm, 'Polygon')) {
      const outer = byName(g, 'outerBoundaryIs')[0] ?? g;
      placemarks.push({ name, type: 'polygon', coords: parseCoords(byName(outer, 'coordinates')[0]?.textContent) });
    }
  }
  return {
    placemarks: placemarks.filter((p) => p.coords.length >= (p.type === 'point' ? 1 : p.type === 'line' ? 2 : 3)),
    imageOverlays: byName(doc, 'GroundOverlay').length,
  };
}

export interface KmlImport {
  layer: ShapeLayer;
  /** Pins for survey numbers that had none yet. */
  newPins: PinMap;
  /** Survey numbers in the file that already had a pin; those pins are left alone. */
  kept: string[];
  /** Village outlines and labels already drawn from the public boundary data. */
  skippedKnown: number;
  imageOverlays: number;
  /** New pins that fall outside the village outline. */
  outside: string[];
}

/**
 * Turns a KML into a private shape layer plus pins. A point (or, failing that, a polygon) whose
 * name is a survey number becomes that survey's pin; Google Earth adds newer placemarks at the
 * end, so the last one in the file wins. Outlines identical to the public village boundaries are
 * skipped because the map already draws them.
 */
export function planKmlImport(
  text: string,
  fileName: string,
  opts: { boundary?: BoundaryCollection; pins: PinMap; now?: string }
): KmlImport {
  const { placemarks, imageOverlays } = parseKml(text);
  const known = opts.boundary?.features ?? [];
  const knownNames = new Set(known.map((f) => placeKey(f.properties.name)));
  const knownVertices = new Set(known.flatMap((f) => outerRings(f).flat().map((c) => `${c[0].toFixed(4)},${c[1].toFixed(4)}`)));
  const own = known.find((f) => f.properties.role === 'village');

  const shapes: MapShape[] = [];
  const fromPoint = new Map<string, { lat: number; lng: number }>();
  const fromPolygon = new Map<string, { lat: number; lng: number }>();
  let skippedKnown = 0;

  for (const p of placemarks) {
    const survey = surveyFromName(p.name) ?? undefined;
    if (!survey && p.type === 'polygon' && p.coords.length >= 10) {
      const hits = p.coords.filter((c) => knownVertices.has(`${c[0].toFixed(4)},${c[1].toFixed(4)}`)).length;
      if (hits / p.coords.length >= 0.8) {
        skippedKnown++;
        continue;
      }
    }
    if (!survey && p.type === 'point' && p.name && knownNames.has(placeKey(p.name))) {
      skippedKnown++;
      continue;
    }
    if (survey && p.type === 'point') {
      fromPoint.set(survey, { lng: p.coords[0][0], lat: p.coords[0][1] });
      continue;
    }
    if (survey && p.type === 'polygon') fromPolygon.set(survey, ringCentroid(p.coords));
    shapes.push({ name: p.name || 'Untitled', survey, type: p.type, coords: p.coords.map((c) => [c[1], c[0]]) });
  }

  const newPins: PinMap = {};
  const kept: string[] = [];
  const outside: string[] = [];
  for (const survey of new Set([...fromPoint.keys(), ...fromPolygon.keys()])) {
    const at = fromPoint.get(survey) ?? fromPolygon.get(survey)!;
    if (opts.pins[survey]) {
      kept.push(survey);
      continue;
    }
    newPins[survey] = { lat: at.lat, lng: at.lng, note: `${fromPoint.has(survey) ? 'Point' : 'Centre of outline'} in ${fileName}` };
    if (own && !outerRings(own).some((r) => insideRing(at, r))) outside.push(survey);
  }

  return {
    layer: {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: fileName,
      added: opts.now ?? new Date().toISOString(),
      visible: true,
      shapes,
    },
    newPins,
    kept,
    skippedKnown,
    imageOverlays,
    outside,
  };
}

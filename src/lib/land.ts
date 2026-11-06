// Land deals: parse AnyRoR e-Chavdi result pages and derive patterns from them.
//
// This file must stay free of imports: scripts/build_dataset.mjs compiles it on its own and
// loads the result as a single module.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SurveyRef {
  /** Survey number as shown, with Gujarati digits converted, e.g. "354/p1". */
  survey: string;
  /** Number in brackets after the survey. e-Chavdi lists "survey(khata)"; we read it as the khata (account) number. */
  khata: string | null;
}

export interface ChavdiEntry {
  /** Mutation entry number (નોંધ નંબર). Sequential per village. */
  entryNo: number;
  /** Entry type exactly as printed (Gujarati). */
  typeGu: string;
  /** Entry date, ISO yyyy-mm-dd. */
  date: string;
  surveys: SurveyRef[];
}

export interface VillageKey {
  district: string;
  taluka: string;
  village: string;
}

export interface ParsedPage extends VillageKey {
  entries: ChavdiEntry[];
  /** yyyy-mm months covered by the page, derived from entry dates. */
  months: string[];
}

export interface LandDataset extends VillageKey {
  /** Months for which an e-Chavdi page was imported (yyyy-mm), even if it had no entries. */
  months: string[];
  entries: ChavdiEntry[];
}

// ---------------------------------------------------------------------------
// Entry types
// ---------------------------------------------------------------------------

export type EntryCategory = 'sale' | 'charge' | 'family' | 'order' | 'other';

export const CATEGORY_META: Record<EntryCategory, { label: string; color: string }> = {
  // Dark-mode categorical steps, validated for adjacent CVD separation (stacked bars).
  sale: { label: 'Sale & gift', color: '#3987e5' },
  charge: { label: 'Loan charge', color: '#d95926' },
  family: { label: 'Family & rights', color: '#199e70' },
  order: { label: 'Official order', color: '#c98500' },
  other: { label: 'Other', color: '#71717a' },
};

export const CATEGORY_ORDER: EntryCategory[] = ['sale', 'charge', 'family', 'order', 'other'];

interface TypeInfo {
  en: string;
  category: EntryCategory;
  /** Which way a loan charge moved, for charge entries. */
  charge?: 'in' | 'out';
}

// Keys are compared after normalising spelling variants (see normaliseType).
const ENTRY_TYPES: Record<string, TypeInfo> = {
  'વેચાણ': { en: 'Sale', category: 'sale' },
  'બક્ષિસ': { en: 'Gift', category: 'sale' },
  'બક્ષીસ': { en: 'Gift', category: 'sale' },
  'બોજો દાખલ': { en: 'Charge entered (loan/mortgage)', category: 'charge', charge: 'in' },
  'બોજા મુક્તિ': { en: 'Charge released', category: 'charge', charge: 'out' },
  'બોજો કમી': { en: 'Charge released', category: 'charge', charge: 'out' },
  'હક કમી': { en: 'Rights relinquished (name removed)', category: 'family' },
  'વહેંચણી': { en: 'Partition', category: 'family' },
  'વારસાઈ': { en: 'Inheritance', category: 'family' },
  'વારસાઇ': { en: 'Inheritance', category: 'family' },
  'બીજા હક દાખલ': { en: 'Other rights entered', category: 'family' },
  'હુકમથી': { en: 'By official order', category: 'order' },
  'સંપાદન': { en: 'Land acquisition', category: 'order' },
  'બિનખેતી': { en: 'Non-agricultural (NA) conversion', category: 'order' },
};

function normaliseType(gu: string): string {
  // e-Chavdi spells હક / હક્ક both ways.
  return gu.trim().replace(/\s+/g, ' ').replace(/હક્ક/g, 'હક');
}

export function entryTypeInfo(typeGu: string): TypeInfo {
  return ENTRY_TYPES[normaliseType(typeGu)] ?? { en: 'Other', category: 'other' };
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const GU_DIGITS = '૦૧૨૩૪૫૬૭૮૯';

export function toAsciiDigits(s: string): string {
  return s.replace(/[૦-૯]/g, (d) => String(GU_DIGITS.indexOf(d)));
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function cellText(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function spanText(html: string, id: string): string {
  const m = html.match(new RegExp(`id="ContentPlaceHolder1_${id}"[^>]*>([^<]*)<`));
  return m ? cellText(m[1]) : '';
}

/** "354/p૧(517), 431(517)" -> [{survey:"354/p1", khata:"517"}, {survey:"431", khata:"517"}] */
export function parseSurveyList(raw: string): SurveyRef[] {
  return toAsciiDigits(raw)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/^(.*?)\s*\(\s*([^)]*?)\s*\)$/);
      return m ? { survey: m[1].replace(/\s+/g, ''), khata: m[2] || null } : { survey: part.replace(/\s+/g, ''), khata: null };
    });
}

function toIsoDate(ddmmyyyy: string): string | null {
  const m = toAsciiDigits(ddmmyyyy).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

export class ChavdiParseError extends Error {}

/**
 * Parse a saved e-Chavdi result page (InfoChavdiNoticeView.aspx). Accepts the whole page or any
 * fragment that contains the village labels and the ContentPlaceHolder1_gvResult table.
 */
export function parseChavdiPage(html: string): ParsedPage {
  const district = spanText(html, 'lblDistrict');
  const taluka = spanText(html, 'lblTaluka');
  const village = spanText(html, 'lblVillage');
  if (!village) {
    throw new ChavdiParseError('No village name found. Is this an e-Chavdi result page (InfoChavdiNoticeView.aspx)?');
  }

  const tableStart = html.indexOf('id="ContentPlaceHolder1_gvResult"');
  if (tableStart < 0) {
    // The page renders without the grid when a month has no notices.
    return { district, taluka, village, entries: [], months: [] };
  }
  const tableEnd = html.indexOf('</table>', tableStart);
  const table = html.slice(tableStart, tableEnd < 0 ? undefined : tableEnd);
  const rows = table.split(/<tr[\s>]/i).slice(1);

  // Find columns by header text so a reordered grid still parses.
  const headers = (rows[0]?.match(/<th[^>]*>[\s\S]*?<\/th>/gi) ?? []).map(cellText);
  const col = (test: (h: string) => boolean, fallback: number) => {
    const i = headers.findIndex(test);
    return i >= 0 ? i : fallback;
  };
  const iNo = col((h) => h.includes('નોંધ નંબર'), 1);
  const iType = col((h) => h.includes('પ્રકાર'), 2);
  const iDate = col((h) => h.includes('તારીખ'), 3);
  const iSurvey = col((h) => h.includes('સરવે'), 4);

  const entries: ChavdiEntry[] = [];
  for (const row of rows) {
    const cells = (row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) ?? []).map(cellText);
    if (cells.length <= Math.max(iNo, iType, iDate, iSurvey)) continue;
    const entryNo = Number(toAsciiDigits(cells[iNo]));
    const date = toIsoDate(cells[iDate]);
    if (!Number.isInteger(entryNo) || entryNo <= 0 || !date) continue;
    entries.push({ entryNo, typeGu: cells[iType], date, surveys: parseSurveyList(cells[iSurvey]) });
  }

  const months = [...new Set(entries.map((e) => e.date.slice(0, 7)))].sort();
  return { district, taluka, village, entries, months };
}

// ---------------------------------------------------------------------------
// Datasets
// ---------------------------------------------------------------------------

export function villageId(v: VillageKey): string {
  return `${v.district}|${v.taluka}|${v.village}`;
}

/** Merge pages or datasets for one village. Later inputs win on the same entry number. */
export function mergeDatasets(base: LandDataset, ...more: (LandDataset | ParsedPage)[]): LandDataset {
  const byNo = new Map(base.entries.map((e) => [e.entryNo, e]));
  const months = new Set(base.months);
  for (const d of more) {
    if (villageId(d) !== villageId(base)) {
      throw new ChavdiParseError(`This page is for ${d.village} (${d.taluka}, ${d.district}), not ${base.village}.`);
    }
    for (const e of d.entries) byNo.set(e.entryNo, e);
    for (const m of d.months) months.add(m);
  }
  return {
    district: base.district,
    taluka: base.taluka,
    village: base.village,
    months: [...months].sort(),
    entries: [...byNo.values()].sort((a, b) => b.entryNo - a.entryNo),
  };
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / DAY_MS);
}

export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

/** yyyy-mm for the `count` months ending with `lastMonth`, oldest first. */
export function monthRange(lastMonth: string, count: number): string[] {
  const [y, m] = lastMonth.split('-').map(Number);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

export type MonthRow = { month: string; imported: boolean; total: number } & Record<EntryCategory, number>;

export function monthlyActivity(data: LandDataset, months: string[]): MonthRow[] {
  const imported = new Set(data.months);
  return months.map((month) => {
    const row = { month, imported: imported.has(month), total: 0, sale: 0, charge: 0, family: 0, order: 0, other: 0 };
    for (const e of data.entries) {
      if (e.date.slice(0, 7) !== month) continue;
      row[entryTypeInfo(e.typeGu).category] += 1;
      row.total += 1;
    }
    return row;
  });
}

/**
 * The notice asks for written objections within 30 days of the notice reaching the holder.
 * We only know the entry date, so this is an estimate.
 */
export const OBJECTION_DAYS = 30;

export function objectionWindow(entry: ChavdiEntry, today: string): { closes: string; daysLeft: number } {
  const closes = addDays(entry.date, OBJECTION_DAYS);
  return { closes, daysLeft: daysBetween(today, closes) };
}

export interface SurveyHistory {
  survey: string;
  khatas: string[];
  entries: ChavdiEntry[]; // oldest first
}

export function surveyHistories(data: LandDataset): Map<string, SurveyHistory> {
  const map = new Map<string, SurveyHistory>();
  const ordered = [...data.entries].sort((a, b) => a.date.localeCompare(b.date) || a.entryNo - b.entryNo);
  for (const e of ordered) {
    for (const s of e.surveys) {
      let h = map.get(s.survey);
      if (!h) {
        h = { survey: s.survey, khatas: [], entries: [] };
        map.set(s.survey, h);
      }
      if (s.khata && !h.khatas.includes(s.khata)) h.khatas.push(s.khata);
      if (!h.entries.includes(e)) h.entries.push(e);
    }
  }
  return map;
}

export interface Pattern {
  id: string;
  kind: 'cluster' | 'cleared-then-transfer' | 'rights-then-sale' | 'charge-cycle' | 'busy';
  title: string;
  detail: string;
  surveys: string[];
  entryNos: number[];
}

const fmt = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

/**
 * Sequences in the public notices that are worth a closer look. These describe what the
 * register shows; they say nothing about why it happened or whether a parcel is a good deal.
 */
export function findPatterns(data: LandDataset): Pattern[] {
  const out: Pattern[] = [];
  const cat = (e: ChavdiEntry) => entryTypeInfo(e.typeGu);

  // 1. Several sales from one khata within a week.
  const salesByKhata = new Map<string, ChavdiEntry[]>();
  for (const e of data.entries) {
    if (cat(e).category !== 'sale') continue;
    for (const k of new Set(e.surveys.map((s) => s.khata).filter((k): k is string => !!k))) {
      salesByKhata.set(k, [...(salesByKhata.get(k) ?? []), e]);
    }
  }
  for (const [khata, sales] of salesByKhata) {
    const sorted = [...sales].sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 0; i < sorted.length; i++) {
      const group = sorted.filter((e) => {
        const d = daysBetween(sorted[i].date, e.date);
        return d >= 0 && d <= 7;
      });
      if (group.length >= 3) {
        const surveys = [...new Set(group.flatMap((e) => e.surveys.map((s) => s.survey)))];
        out.push({
          id: `cluster-${khata}-${sorted[i].date}`,
          kind: 'cluster',
          title: `${group.length} sale entries from khata ${khata} within a week`,
          detail: `Entries ${group.map((e) => e.entryNo).join(', ')} between ${fmt(group[0].date)} and ${fmt(group[group.length - 1].date)} cover survey nos. ${surveys.join(', ')}.`,
          surveys,
          entryNos: group.map((e) => e.entryNo),
        });
        break;
      }
    }
  }

  // Per-survey sequences.
  for (const h of surveyHistories(data).values()) {
    const es = h.entries;
    for (let i = 0; i < es.length; i++) {
      for (let j = i + 1; j < es.length; j++) {
        const a = cat(es[i]);
        const b = cat(es[j]);
        const gap = daysBetween(es[i].date, es[j].date);
        const tail = `Survey ${h.survey}: entry ${es[i].entryNo} (${fmt(es[i].date)}), then entry ${es[j].entryNo} (${fmt(es[j].date)}), ${gap} days apart.`;
        if (a.charge === 'out' && (b.category === 'sale' || normaliseType(es[j].typeGu) === 'હક કમી') && gap <= 90) {
          out.push({
            id: `ctt-${h.survey}-${es[j].entryNo}`,
            kind: 'cleared-then-transfer',
            title: `Charge released, then ${b.en.toLowerCase()}`,
            detail: tail,
            surveys: [h.survey],
            entryNos: [es[i].entryNo, es[j].entryNo],
          });
        } else if (normaliseType(es[i].typeGu) === 'બીજા હક દાખલ' && b.category === 'sale' && gap <= 120) {
          out.push({
            id: `rts-${h.survey}-${es[j].entryNo}`,
            kind: 'rights-then-sale',
            title: 'Other rights entered, then a sale',
            detail: tail,
            surveys: [h.survey],
            entryNos: [es[i].entryNo, es[j].entryNo],
          });
        } else if (a.charge === 'in' && b.charge === 'out' && gap <= 30) {
          out.push({
            id: `cc-${h.survey}-${es[j].entryNo}`,
            kind: 'charge-cycle',
            title: 'Charge entered and released within a month',
            detail: tail,
            surveys: [h.survey],
            entryNos: [es[i].entryNo, es[j].entryNo],
          });
        }
      }
    }
    if (es.length >= 3) {
      out.push({
        id: `busy-${h.survey}`,
        kind: 'busy',
        title: `Survey ${h.survey} appears in ${es.length} entries`,
        detail: `Entries ${es.map((e) => `${e.entryNo} (${entryTypeInfo(e.typeGu).en.toLowerCase()})`).join(', ')}.`,
        surveys: [h.survey],
        entryNos: es.map((e) => e.entryNo),
      });
    }
  }

  // Patterns sharing the same entries describe one sequence; keep the first.
  const seen = new Set<string>();
  return out.filter((p) => {
    const key = `${p.kind}:${[...p.entryNos].sort().join(',')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Map pins
// ---------------------------------------------------------------------------

export interface SurveyPin {
  lat: number;
  lng: number;
  /** Where the position was checked, e.g. "AnyRoR village map". */
  note?: string;
}

export type PinMap = Record<string, SurveyPin>;

export function pinsToGeoJson(village: VillageKey, pins: PinMap): string {
  return JSON.stringify(
    {
      type: 'FeatureCollection',
      features: Object.entries(pins).map(([survey, p]) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        properties: { survey, village: village.village, taluka: village.taluka, district: village.district, note: p.note ?? '' },
      })),
    },
    null,
    2
  );
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function pinsToKml(village: VillageKey, pins: PinMap): string {
  const marks = Object.entries(pins)
    .map(
      ([survey, p]) =>
        `    <Placemark><name>${xml(survey)}</name><description>${xml(`${village.village}, ${village.taluka}${p.note ? ` · ${p.note}` : ''}`)}</description><Point><coordinates>${p.lng},${p.lat},0</coordinates></Point></Placemark>`
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n  <Document>\n    <name>${xml(village.village)} survey pins</name>\n${marks}\n  </Document>\n</kml>\n`;
}

/** Accepts our GeoJSON export (Point features with a `survey` property). */
export function pinsFromGeoJson(text: string): PinMap {
  const parsed = JSON.parse(text) as { features?: { geometry?: { type?: string; coordinates?: number[] }; properties?: { survey?: unknown; note?: unknown } }[] };
  const out: PinMap = {};
  for (const f of parsed.features ?? []) {
    const c = f.geometry?.coordinates;
    const survey = f.properties?.survey;
    if (f.geometry?.type !== 'Point' || !c || typeof survey !== 'string') continue;
    const [lng, lat] = c;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out[survey] = { lat, lng, note: typeof f.properties?.note === 'string' && f.properties.note ? f.properties.note : undefined };
  }
  return out;
}

// ---------------------------------------------------------------------------
// My land and nearby notices
// ---------------------------------------------------------------------------

/** Canonical form for comparing survey numbers typed by a person with those on e-Chavdi. */
export function normaliseSurvey(s: string): string {
  return toAsciiDigits(s).toLowerCase().replace(/\s+/g, '').replace(/પૈકી/g, 'p');
}

/** "210/p1" -> "210": the original survey number that parts are carved out of. */
export function baseSurvey(s: string): string {
  return normaliseSurvey(s).split('/')[0];
}

/**
 * The survey number in a place name from Google Earth or another map, or null:
 * "Survey No. 58", "S.No 118/2", "Sy. no. 210 p1", "સર્વે નં. ૫૮", "સ.નં. 260/1/પૈકી1", or a bare "118/2".
 */
export function surveyFromName(name: string): string | null {
  const s = toAsciiDigits(name).trim();
  const part = String.raw`\d+[a-z]?(?:\s*\/\s*(?:p|પૈકી)?\s*\d*[a-z]?)*(?:\s+(?:p|પૈકી)\s*\d+)?`;
  const labelled = new RegExp(String.raw`(?<![a-z])(?:survey|sur\.?|s\.?\s*no|sy|r\.?\s*s|block|સર્વે|સ\.\s*નં|બ્લોક)\.?\s*(?:no\.?|nos?\.?|number|નં\.?|નંબર)?\s*[:#.\-]?\s*(${part})`, 'i');
  const m = s.match(labelled) ?? s.match(new RegExp(String.raw`^(${part})$`, 'i'));
  if (!m) return null;
  const out = normaliseSurvey(m[1]).replace(/\/+$/, '').replace(/^(\d+[a-z]?(?:\/[a-z0-9]+)*)p(\d+)$/, '$1/p$2');
  return /^\d/.test(out) ? out : null;
}

/** "58, 118/2  260" -> ["58", "118/2", "260"]. Commas, semicolons, spaces or new lines separate. */
export function parseSurveyInput(text: string): string[] {
  return [...new Set(text.split(/[,;\s]+/).map(normaliseSurvey).filter(Boolean))];
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/**
 * How a notice relates to the land you watch, strongest first:
 * - mine:        it lists one of your survey numbers
 * - same-survey: it lists another part of the same original survey (e.g. 210/p3 for 210/p1),
 *                which lies inside that survey's boundary
 * - pinned-near: both survey numbers are pinned and lie within the chosen distance
 * - number-near: the survey numbers are numerically close. Only a hint: numbering usually runs
 *                across a village, but neighbours by number are not always neighbours on the ground.
 */
export type RelationKind = 'mine' | 'same-survey' | 'pinned-near' | 'number-near';

export const RELATION_ORDER: RelationKind[] = ['mine', 'same-survey', 'pinned-near', 'number-near'];

export const RELATION_META: Record<RelationKind, { label: string; short: string }> = {
  mine: { label: 'Your land', short: 'Yours' },
  'same-survey': { label: 'Same original survey as yours', short: 'Same survey' },
  'pinned-near': { label: 'Near your land on the map', short: 'Near' },
  'number-near': { label: 'Survey number close to yours (a guess)', short: 'Close no.' },
};

export interface Relation {
  kind: RelationKind;
  /** The notice's survey number that matched. */
  survey: string;
  /** Your survey number it matched against. */
  mySurvey: string;
  distanceKm?: number;
  numberGap?: number;
}

export interface NearbyOptions {
  pins: PinMap;
  /** Distance for pinned-near; 0 turns it off. */
  radiusKm: number;
  /** Max difference between survey numbers for number-near; 0 turns it off. */
  numberWindow: number;
}

/** Strongest relation between a notice and the land you watch, or null. */
export function relateToMyLand(entry: ChavdiEntry, mine: string[], opts: NearbyOptions): Relation | null {
  let best: Relation | null = null;
  const better = (r: Relation) => {
    if (!best) return true;
    const a = RELATION_ORDER.indexOf(r.kind);
    const b = RELATION_ORDER.indexOf(best.kind);
    if (a !== b) return a < b;
    if (r.distanceKm !== undefined && best.distanceKm !== undefined) return r.distanceKm < best.distanceKm;
    if (r.numberGap !== undefined && best.numberGap !== undefined) return r.numberGap < best.numberGap;
    return false;
  };
  const pinOf = (s: string) => {
    const key = Object.keys(opts.pins).find((k) => normaliseSurvey(k) === s);
    return key ? opts.pins[key] : undefined;
  };

  for (const ref of entry.surveys) {
    const s = normaliseSurvey(ref.survey);
    for (const m of mine) {
      let r: Relation | null = null;
      if (s === m) r = { kind: 'mine', survey: ref.survey, mySurvey: m };
      else if (baseSurvey(s) === baseSurvey(m)) r = { kind: 'same-survey', survey: ref.survey, mySurvey: m };
      else {
        const ps = opts.radiusKm > 0 ? pinOf(s) : undefined;
        const pm = ps ? pinOf(m) : undefined;
        const d = ps && pm ? haversineKm(ps, pm) : undefined;
        if (d !== undefined && d <= opts.radiusKm) r = { kind: 'pinned-near', survey: ref.survey, mySurvey: m, distanceKm: d };
        else if (opts.numberWindow > 0) {
          const a = Number(baseSurvey(s));
          const b = Number(baseSurvey(m));
          if (Number.isInteger(a) && Number.isInteger(b) && Math.abs(a - b) <= opts.numberWindow) {
            r = { kind: 'number-near', survey: ref.survey, mySurvey: m, numberGap: Math.abs(a - b) };
          }
        }
      }
      if (r && better(r)) best = r;
    }
  }
  return best;
}

/** Relation for every notice that has one, keyed by entry number. */
export function relateAll(entries: ChavdiEntry[], mine: string[], opts: NearbyOptions): Map<number, Relation> {
  const out = new Map<number, Relation>();
  if (mine.length === 0) return out;
  for (const e of entries) {
    const r = relateToMyLand(e, mine, opts);
    if (r) out.set(e.entryNo, r);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

/** How many of the given months have an imported page. */
export function coverage(data: LandDataset, months: string[]): { imported: number; total: number } {
  const have = new Set(data.months);
  return { imported: months.filter((m) => have.has(m)).length, total: months.length };
}

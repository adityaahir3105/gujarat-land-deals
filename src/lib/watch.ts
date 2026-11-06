// Area watch: public developments around the village (roads, pipelines, acquisition, zoning,
// industry), kept in src/data/land/watch.json and refreshed by a weekly task through a PR.
// Items are public and area-level. Whether one touches *your* land is worked out in the browser
// against your private survey numbers, never stored in the file.

import { baseSurvey, normaliseSurvey } from './land';

export type WatchCategory = 'acquisition' | 'infrastructure' | 'zoning' | 'environment' | 'industry' | 'other';
export type WatchScope = 'village' | 'nearby' | 'region';

export interface WatchSource {
  label: string;
  url: string;
}

export interface WatchItem {
  /** Stable id: "YYYY-MM-DD-short-slug". */
  id: string;
  /** Date of the event or publication, YYYY-MM-DD. */
  date: string;
  category: WatchCategory;
  /** village: names Chirai Moti; nearby: Bhachau taluka / NH-41 corridor; region: Kachchh. */
  scope: WatchScope;
  title: string;
  summary: string;
  /** Survey numbers a public notice names in the village, as printed. Empty if none. */
  surveys: string[];
  sources: WatchSource[];
  /** When the item was added to the feed, YYYY-MM-DD. */
  added: string;
}

export interface WatchFeed {
  about: string;
  /** Date the feed last changed. */
  updated: string;
  items: WatchItem[];
}

export const WATCH_CATEGORY_META: Record<WatchCategory, { label: string; color: string }> = {
  acquisition: { label: 'Acquisition / right of use', color: '#d95926' },
  infrastructure: { label: 'Roads & infrastructure', color: '#3987e5' },
  zoning: { label: 'Zoning / GIDC / SEZ', color: '#c98500' },
  environment: { label: 'Environmental clearance', color: '#199e70' },
  industry: { label: 'Industry & logistics', color: '#9085e9' },
  other: { label: 'Other', color: '#71717a' },
};

export const WATCH_SCOPE_LABEL: Record<WatchScope, string> = {
  village: 'Chirai Moti',
  nearby: 'Bhachau / NH-41',
  region: 'Kachchh',
};

const CATEGORIES = Object.keys(WATCH_CATEGORY_META);
const SCOPES = Object.keys(WATCH_SCOPE_LABEL);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Problems with a feed, as readable strings; empty when valid. */
export function validateWatchFeed(feed: unknown): string[] {
  const errs: string[] = [];
  const f = feed as Partial<WatchFeed>;
  if (!f || typeof f !== 'object') return ['feed is not an object'];
  if (typeof f.updated !== 'string' || !ISO.test(f.updated)) errs.push('updated must be YYYY-MM-DD');
  if (!Array.isArray(f.items)) return [...errs, 'items must be an array'];
  const ids = new Set<string>();
  f.items.forEach((it, i) => {
    const at = `items[${i}]${it && typeof it.id === 'string' ? ` (${it.id})` : ''}`;
    if (!it || typeof it !== 'object') return errs.push(`${at}: not an object`);
    if (typeof it.id !== 'string' || !/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(it.id)) errs.push(`${at}: id must look like 2026-10-15-short-slug`);
    else if (ids.has(it.id)) errs.push(`${at}: duplicate id`);
    else ids.add(it.id);
    if (typeof it.date !== 'string' || !ISO.test(it.date)) errs.push(`${at}: date must be YYYY-MM-DD`);
    if (typeof it.added !== 'string' || !ISO.test(it.added)) errs.push(`${at}: added must be YYYY-MM-DD`);
    if (!CATEGORIES.includes(it.category as string)) errs.push(`${at}: category must be one of ${CATEGORIES.join(', ')}`);
    if (!SCOPES.includes(it.scope as string)) errs.push(`${at}: scope must be one of ${SCOPES.join(', ')}`);
    if (typeof it.title !== 'string' || it.title.length < 10) errs.push(`${at}: title missing`);
    if (typeof it.summary !== 'string' || it.summary.length < 20) errs.push(`${at}: summary missing`);
    if (!Array.isArray(it.surveys) || !it.surveys.every((s) => typeof s === 'string')) errs.push(`${at}: surveys must be a list of strings`);
    if (!Array.isArray(it.sources) || it.sources.length === 0) errs.push(`${at}: needs at least one source`);
    else
      it.sources.forEach((s, j) => {
        if (!s || typeof s.label !== 'string' || !s.label || typeof s.url !== 'string' || !/^https:\/\//.test(s.url)) {
          errs.push(`${at}: sources[${j}] needs a label and an https url`);
        }
      });
  });
  return errs;
}

export interface WatchMatch {
  survey: string;
  mySurvey: string;
  exact: boolean;
}

/** Survey numbers in an item that are yours, or parts of the same original survey as yours. */
export function matchWatchItem(item: WatchItem, myLand: string[]): WatchMatch[] {
  const out: WatchMatch[] = [];
  for (const raw of item.surveys) {
    const s = normaliseSurvey(raw);
    for (const m of myLand) {
      if (s === m) out.push({ survey: raw, mySurvey: m, exact: true });
      else if (baseSurvey(s) === baseSurvey(m)) out.push({ survey: raw, mySurvey: m, exact: false });
    }
  }
  return out;
}

export function sortWatchItems(items: WatchItem[]): WatchItem[] {
  return [...items].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

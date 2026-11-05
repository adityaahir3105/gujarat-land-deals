#!/usr/bin/env node
// Build src/data/land/echavdi.json from saved e-Chavdi result pages.
//
//   node scripts/build_dataset.mjs            # reads scripts/raw/*.html
//   node scripts/build_dataset.mjs dir/ a.html # or any files / folders you pass
//
// Uses the same parser as the dashboard's in-browser import (src/lib/land.ts), loaded through
// Node's built-in TypeScript type stripping (Node 22.18+ / 23.6+).
//
// A page with no entries cannot tell which month it was for. Name such files
// "...-YYYY-MM.html" and the month is taken from the file name, so the dashboard can show the
// month as "imported, no notices" instead of "missing".

import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseChavdiPage, mergeDatasets, villageId } from '../src/lib/land.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outFile = join(root, 'src/data/land/echavdi.json');

const args = process.argv.slice(2);
const inputs = args.length ? args : [join(here, 'raw')];
const files = inputs.flatMap((p) =>
  statSync(p).isDirectory()
    ? readdirSync(p).filter((f) => f.endsWith('.html') || f.endsWith('.htm')).map((f) => join(p, f))
    : [p]
);

const byVillage = new Map();
for (const file of files.sort()) {
  const page = parseChavdiPage(readFileSync(file, 'utf8'));
  const m = file.match(/-(\d{4})-(\d{2})\.html?$/);
  if (m) page.months = [...new Set([...page.months, `${m[1]}-${m[2]}`])].sort();
  const id = villageId(page);
  const base = byVillage.get(id) ?? { district: page.district, taluka: page.taluka, village: page.village, months: [], entries: [] };
  byVillage.set(id, mergeDatasets(base, page));
  console.log(`${file}: ${page.entries.length} entries, months ${page.months.join(', ') || '(none found)'}`);
}

const datasets = [...byVillage.values()];
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(datasets, null, 1) + '\n');
for (const d of datasets) {
  console.log(`-> ${d.village} (${d.taluka}, ${d.district}): ${d.entries.length} entries over ${d.months.length} month(s)`);
}
console.log(`wrote ${outFile}`);

#!/usr/bin/env node
// Build src/data/land/boundaries.json: the outline of each configured village and of the villages
// and towns around it, from DataMeet's "Indian Village Boundaries" (Gujarat layer, 2001 census
// village maps, ODbL 1.0).
//
//   node scripts/build_boundaries.mjs              # downloads gj.geojson (~29 MB) from GitHub
//   node scripts/build_boundaries.mjs gj.geojson   # or uses a copy you already have
//
// Villages are matched on `census2001` in src/data/land/villages.ts. Neighbours are the
// polygons within NEAR_M of the village outline; `touches` marks those that share a border.
// These are village-level outlines only: no survey numbers or plots.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const SOURCE_URL = 'https://raw.githubusercontent.com/datameet/indian_village_boundaries/master/gj/gj.geojson';
const NEAR_M = 2500;
const TOUCH_M = 30;

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

async function load(file) {
  const src = readFileSync(join(root, file), 'utf8');
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: file,
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

const { villageId } = await load('src/lib/land.ts');
const { VILLAGES } = await load('src/data/land/villages.ts');

const arg = process.argv[2];
let text;
if (arg) {
  text = readFileSync(arg, 'utf8');
} else {
  console.log(`Downloading ${SOURCE_URL} …`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  text = await res.text();
}
const all = JSON.parse(text).features;

// Outer rings only; DataMeet's Gujarat layer has no holes we need.
const rings = (f) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates[0]] : f.geometry.coordinates.map((p) => p[0]));

function metres(lat0) {
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110574;
  return ([lng, lat]) => [lng * kx, lat * ky];
}

function minDistance(a, b, xy) {
  const seg = (p, s, e) => {
    const [px, py] = xy(p);
    const [ax, ay] = xy(s);
    const [bx, by] = xy(e);
    const dx = bx - ax;
    const dy = by - ay;
    const l = dx * dx + dy * dy;
    const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
  };
  const oneWay = (r1, r2) => {
    let best = Infinity;
    for (const p of r1) for (let i = 0; i < r2.length - 1; i++) best = Math.min(best, seg(p, r2[i], r2[i + 1]));
    return best;
  };
  return Math.min(oneWay(a, b), oneWay(b, a));
}

function bbox(rs) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of rs) for (const [x, y] of r) {
    b[0] = Math.min(b[0], x);
    b[1] = Math.min(b[1], y);
    b[2] = Math.max(b[2], x);
    b[3] = Math.max(b[3], y);
  }
  return b;
}

function feature(f, role, extra = {}) {
  const p = f.properties;
  return {
    type: 'Feature',
    properties: { name: p.NAME, kind: p.TYPE, subDistrict: p.SUB_DISTRICT, district: p.DISTRICT, census2001: p.CENSUS_CODE_2001, role, ...extra },
    geometry: f.geometry,
  };
}

const villages = {};
for (const v of VILLAGES) {
  if (!v.census2001) {
    console.log(`${v.en.village}: no census2001 code in villages.ts, skipped.`);
    continue;
  }
  const own = all.find((f) => f.properties.CENSUS_CODE_2001 === v.census2001);
  if (!own) throw new Error(`${v.en.village}: census code ${v.census2001} not found in the source.`);
  const ownRings = rings(own);
  const [x0, y0, x1, y1] = bbox(ownRings);
  const xy = metres((y0 + y1) / 2);
  const pad = 0.04; // degrees, a little over NEAR_M
  const near = [];
  for (const f of all) {
    if (f === own) continue;
    const rs = rings(f);
    const [a0, b0, a1, b1] = bbox(rs);
    if (a1 < x0 - pad || a0 > x1 + pad || b1 < y0 - pad || b0 > y1 + pad) continue;
    const d = Math.min(...rs.flatMap((r) => ownRings.map((o) => minDistance(r, o, xy))));
    if (d <= NEAR_M) near.push({ f, d });
  }
  near.sort((a, b) => a.d - b.d || a.f.properties.NAME.localeCompare(b.f.properties.NAME));
  villages[villageId(v)] = {
    type: 'FeatureCollection',
    features: [feature(own, 'village'), ...near.map(({ f, d }) => feature(f, 'neighbour', { touches: d <= TOUCH_M }))],
  };
  console.log(
    `${v.en.village}: ${own.properties.NAME} (${v.census2001}) + ${near.length} around it: ` +
      near.map(({ f, d }) => `${f.properties.NAME}${d <= TOUCH_M ? '' : ` ${Math.round(d)} m`}`).join(', ')
  );
}

const out = {
  source: 'DataMeet "Indian Village Boundaries", Gujarat layer (village maps of Census 2001)',
  sourceUrl: 'https://github.com/datameet/indian_village_boundaries',
  license: 'ODbL-1.0',
  attribution: '© DataMeet contributors, ODbL',
  caveat: 'Village-level outlines digitised from census maps. Not a survey or legal boundary; expect tens of metres of error in places.',
  villages,
};
const outFile = join(root, 'src/data/land/boundaries.json');
writeFileSync(outFile, JSON.stringify(out) + '\n');
console.log(`Wrote ${outFile}`);

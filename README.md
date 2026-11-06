# Gujarat Land Deals

A dashboard over AnyRoR **e-Chavdi** mutation notices for a Gujarat village. Starts with
Chirai Moti (ચીરઈ મોટી), Bhachau taluka, Kachchh district, AnyRoR village 047.

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · Recharts · Leaflet.

## What it shows

- Notices over the last 24 months: sales and gifts, loan charges entered and released, family and
  rights changes, official orders. A strip shows which months have been imported, so a gap in the
  data is not mistaken for a quiet month.
- Sequences per survey number and khata: several sales from one khata within a week, a charge
  released and then a transfer, other rights entered and then a sale, and a charge entered and
  released within a month. They describe the register, not the reasons.
- An estimate of each notice's 30-day objection window (entry date + 30 days; the real window
  counts from when the notice is served).
- A satellite map (Esri World Imagery, OpenStreetMap streets) for pinning survey numbers.

## Data

- Source: e-Chavdi on [AnyRoR](https://anyror.gujarat.gov.in/LandRecordRural.aspx), Revenue
  Department, Government of Gujarat. Online records are for information only, not certified copies.
- The AnyRoR form has a CAPTCHA. Nothing here solves or bypasses it; a person fetches each month.
- `src/data/land/echavdi.json` is built from saved result pages in `scripts/raw/`:
  1. `pip install playwright && python -m playwright install chromium` (once)
  2. `python scripts/collect_echavdi.py` opens a browser. Choose e-CHAVDI, the village and a month,
     solve the CAPTCHA, and the script saves each result page. Repeat for each month.
  3. `npm run data:build` parses the pages with the app's own parser (`src/lib/land.ts`) and writes
     the JSON. Needs `npm install` first (it uses the project's TypeScript compiler); any Node 18+.
- Or drop saved pages into "Add months" on the page. They stay in that browser; "Dataset JSON"
  downloads the merged data in the same shape as `echavdi.json`.
- A month with no notices only counts as checked if its file name ends in `-YYYY-MM.html`.
- Seeded with October 2026 (22 notices).

## Map

e-Chavdi has survey numbers but no coordinates, and there is no parcel layer here. Pin each
survey number once, after checking it on the official village map (AnyRoR / taluka survey
office), or with "Pin at my location" while standing on the plot. Pins stay in the browser and
export to KML (Google Earth) or GeoJSON, and load back from GeoJSON.

The village centre is approximate (GeoNames, see `src/data/land/villages.ts`); another gazetteer
puts it about 13 km away. Use "Set village centre" to correct it.

## Adding a village

Add it to `src/data/land/villages.ts` with names exactly as AnyRoR prints them, collect its pages,
and run `npm run data:build`. The page currently shows the first village in the list.

## Development

```bash
npm install
npm run dev
```

CI runs `npm run lint` and `npm run typecheck`.

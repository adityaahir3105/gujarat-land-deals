# Gujarat Land Deals

Next.js 16 (App Router) + React 19 + TypeScript + Tailwind 4. Charts: Recharts. Map: Leaflet (plain, no react-leaflet).

## Map
- `src/app/page.tsx` – dashboard; `src/app/summary/page.tsx` – summary for relatives. Both render their content client-only (`LandLoader`, `SummaryLoader`)
- Static export (`output: 'export'` → `out/`), hosted on Firebase Hosting (Spark, free): `firebase.json`, `.github/workflows/deploy.yml`. Keep it serverless: no API routes, server actions or dynamic rendering
- `src/lib/land.ts` – e-Chavdi parser, entry-type dictionary, analysis, pin export. No imports: `scripts/build_dataset.mjs` compiles it alone with `typescript` and loads it
- `src/lib/land-storage.ts` – localStorage for imported pages, pins, village centre, my land, nearby settings, seen notices; backup/restore
- `src/lib/overlay.ts` – village map scans: 3-point affine alignment and IndexedDB storage (private, never committed)
- `src/lib/geo.ts` – village outline types, KML/KMZ import (shapes and survey pins; private, localStorage)
- `src/data/land/` – `villages.ts` (config), `echavdi.json` and `boundaries.json` (generated; DataMeet, ODbL) and `watch.json` (area watch feed, typed and validated in `src/lib/watch.ts`)
- `scripts/` – `collect_echavdi.py` (saves pages while a person browses), `build_dataset.mjs`, `raw/` pages

## Commands (CI runs lint and typecheck)
- `npm run lint`, `npm run typecheck`, `npm run build`
- `npm run data:build` – regenerate `src/data/land/echavdi.json` from `scripts/raw/` (saved `.html` pages and "Dataset JSON" exports from the app)
- `npm run deploy` – build and deploy to Firebase Hosting (project in `.firebaserc`)
- `npm run watch:check` – validate `watch.json` (CI runs it)
- `npm run boundaries:build` – regenerate `src/data/land/boundaries.json` from DataMeet's Gujarat village boundaries

## Conventions
- Never automate the AnyRoR CAPTCHA. Collection stays human-in-the-loop.
- Copy is calm and descriptive: no buy/sell advice, valuations or claims about why an entry happened.
- Do not store owner names from notice details.
- "My land" is private: keep it in localStorage only. Never commit a user's survey numbers or put them in the build. Village map scans and imported KML/KMZ shapes likewise stay in the browser unless the owner asks to publish them. Only public village-level outlines (`boundaries.json`) are committed.
- Every figure carries its source. Edit `echavdi.json` only by re-running the builder.
- Area watch (`watch.json`): area-level public developments only, each with at least one https source. Survey numbers only when a public notice prints them. Never add an owner's own land, prices, offers or other private details; matching against "my land" happens in the browser. Updated weekly by a scheduled task through a PR.
- Lint forbids calling setState directly inside effects.

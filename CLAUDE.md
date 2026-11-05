# Gujarat Land Deals

Next.js 16 (App Router) + React 19 + TypeScript + Tailwind 4. Charts: Recharts. Map: Leaflet (plain, no react-leaflet).

## Map
- `src/app/page.tsx` – the dashboard page (server); `src/components/land/LandLoader.tsx` renders the rest client-only
- `src/lib/land.ts` – e-Chavdi parser, entry-type dictionary, analysis, pin export. No imports, erasable TS only: `scripts/build_dataset.mjs` runs it with Node type stripping
- `src/lib/land-storage.ts` – localStorage for imported pages, pins, village centre
- `src/data/land/` – `villages.ts` (config) and `echavdi.json` (generated)
- `scripts/` – `collect_echavdi.py` (saves pages while a person browses), `build_dataset.mjs`, `raw/` pages

## Commands (CI runs lint and typecheck)
- `npm run lint`, `npm run typecheck`, `npm run build`
- `npm run data:build` – regenerate `src/data/land/echavdi.json` from `scripts/raw/`

## Conventions
- Never automate the AnyRoR CAPTCHA. Collection stays human-in-the-loop.
- Copy is calm and descriptive: no buy/sell advice, valuations or claims about why an entry happened.
- Do not store owner names from notice details.
- Every figure carries its source. Edit `echavdi.json` only by re-running the builder.
- Lint forbids calling setState directly inside effects.

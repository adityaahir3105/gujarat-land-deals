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
- **My land** (private to your browser): your survey numbers, an alert when any notice lists one of
  them (with the estimated objection window), and deals near your land:
  - *same original survey*: another part of the same survey (e.g. 210/p3 for 210/p1);
  - *near on the map*: both survey numbers pinned and within 0.5–5 km;
  - *close survey number*: within ±5/10/25. A hint only, since neighbours by number are not
    always neighbours on the ground.
- **New since last visit**: notices that were not there last time are marked NEW.
- **Summary** (`/summary`): a phone-friendly page for relatives with sales and record changes over
  12 or 24 months, labelled in English and Gujarati, always stating how many months the data covers.
  Your own land appears there only in your browser.
- **Area watch**: public developments around Chirai Moti, Bhachau and the NH-41 corridor (roads,
  pipelines and right-of-use notices, acquisition, GIDC/SEZ, environmental clearances, industry),
  each with its source. A weekly scheduled task researches new items and opens a PR; merging it
  publishes them. Items that name your survey numbers (or other parts of the same survey) are
  flagged only in your browser. The card also reminds you when e-Chavdi is a month behind, since
  that has to be collected by hand (CAPTCHA).
- **Village map sheets** (private to your browser): upload a scan of the village map (gam nakasho),
  then line it up with the satellite view by clicking three matching places on the scan and on the
  map (highway or railway crossings, road junctions, sharp boundary corners, spread like a big
  triangle). The sheet is drawn under the pins with adjustable opacity, white paper see-through, so
  survey numbers can be pinned where they really are. Old hand-drawn sheets are not perfectly to
  scale; expect some local error. Use a full-resolution scan so the numbers are readable.
- **Backup / restore**: moves your land, pins and imported months to another device as one file.

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

## Privacy

"My land", pins, nearby settings and imported months are stored in the browser's localStorage and
never written to the repository or the built site. The public site only contains the committed
e-Chavdi notices, which are public records without owner names. Keep backup files private: they
list your survey numbers.

## Hosting (free): Firebase Hosting on the Spark plan

The app is exported as static files (`npm run build` writes `out/`), so it needs no server.
Firebase Hosting's free Spark plan covers it: 10 GB storage and 360 MB/day transfer, roughly a
thousand first visits a day for this app. A Spark project has no billing account, so it cannot be
charged; if a limit is ever hit, the site pauses until the next day. Check the current limits on
[firebase.google.com/pricing](https://firebase.google.com/pricing).

Use a **new** Firebase project. Adding Firebase to an existing Google Cloud project that has
billing (for example one already running Cloud Run apps) puts it on the pay-as-you-go Blaze plan.

1. In the [Firebase console](https://console.firebase.google.com), with whichever Google account
   you prefer, add a project (e.g. `gujarat-land-deals`). Analytics is not needed. Do not upgrade
   it to Blaze.
2. Deploy from your computer:
   ```bash
   npx firebase-tools@15 login
   npm run deploy -- --project YOUR_PROJECT_ID
   ```
   The site is then at `https://YOUR_PROJECT_ID.web.app`.
3. Optional: deploy on every push to `main`. See "Auto-deploy from GitHub" below.

## Auto-deploy from GitHub

`.github/workflows/deploy.yml` builds on every push to `main` and deploys once a Firebase service
account secret exists. Until then it builds and prints a notice. Set it up once:

1. In the project folder, signed in to the Firebase CLI with the account that owns the project:
   ```bash
   npx firebase-tools@15 init hosting:github
   ```
   - Repository: `adityaahir3105/gujarat-land-deals`
   - Build script before every deploy: **No** (the repo's workflow already builds)
   - Automatic deployment when a PR is merged: **No** (the repo's workflow already does this)

   It creates a deploy-only service account, stores its key as a GitHub secret
   (`FIREBASE_SERVICE_ACCOUNT_GUJARAT_LAND_DEALS_AHIR`), and may write
   `.github/workflows/firebase-hosting-*.yml`. Delete those generated files instead of
   committing them, or every push would deploy twice. Keep `firebase.json` as it is.
2. GitHub → Actions → "Deploy to Firebase Hosting" → **Run workflow**. The Deploy step should run.

Manual alternative: create a service account with the roles Firebase Authentication Admin,
Firebase Hosting Admin, Cloud Run Viewer and API Keys Viewer, create a JSON key, and save it as the
repository secret `FIREBASE_SERVICE_ACCOUNT`. Delete the key file afterwards.

## Publishing new months to the live site

The live site only contains what is committed in `src/data/land/echavdi.json`. Months you import
in your own browser stay on that device until you publish them:

1. In the app's "Add months" panel, import the pages, then press **Dataset JSON**. (Or skip this
   and save the result pages to `scripts/raw/` directly.)
2. Move the downloaded `*-echavdi.json` into `scripts/raw/`.
3. Rebuild and check the counts it prints:
   ```bash
   npm run data:build
   ```
4. Commit `scripts/raw/` and `src/data/land/echavdi.json`, then deploy. `.firebaserc` sets the
   project, so no flag is needed:
   ```bash
   npm run deploy
   ```
   If the CLI is signed in to several Google accounts, add `-- --account you@gmail.com`.

Dataset exports contain only public notice data (entry numbers, types, dates, survey and khata
numbers), not your land, pins or settings, so they are safe to commit. Backup files are different
and stay private.

## Adding a village

Add it to `src/data/land/villages.ts` with names exactly as AnyRoR prints them, collect its pages,
and run `npm run data:build`. The page currently shows the first village in the list.

## Development

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # static export to out/
npm start       # serve out/ locally
```

CI runs `npm run lint` and `npm run typecheck`.

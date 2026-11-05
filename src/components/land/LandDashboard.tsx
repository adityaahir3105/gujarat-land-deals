'use client';

import { useCallback, useMemo, useState } from 'react';
import { Download, Eraser, Layers, Upload } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import {
  LandDataset,
  ParsedPage,
  PinMap,
  entryTypeInfo,
  findPatterns,
  mergeDatasets,
  monthRange,
  monthlyActivity,
  objectionWindow,
  pinsFromGeoJson,
  pinsToGeoJson,
  pinsToKml,
  surveyHistories,
} from '@/lib/land';
import { downloadText, landStorage } from '@/lib/land-storage';
import type { VillageConfig } from '@/data/land/villages';
import { cn } from '@/lib/utils';
import { ActivityChart, monthName } from './ActivityChart';
import { EntriesTable } from './EntriesTable';
import { ImportPanel } from './ImportPanel';
import { LandMap, pinMapToList } from './LandMap';
import { SurveyPanel } from './SurveyPanel';

interface LandDashboardProps {
  village: VillageConfig;
  seed: LandDataset;
}

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function Stat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <p className="text-xs text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-100">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}

const smallBtn =
  'inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100';

export function LandDashboard({ village, seed }: LandDashboardProps) {
  // This component only renders in the browser (see LandLoader), so storage is safe to read here.
  const [imports, setImports] = useState<LandDataset | null>(() => landStorage.loadImports(seed));
  const [pins, setPins] = useState<PinMap>(() => landStorage.loadPins(seed));
  const [centerOverride, setCenterOverride] = useState(() => landStorage.loadCenter(seed));
  const [selected, setSelected] = useState<string | null>(null);
  const [placing, setPlacing] = useState<null | 'pin' | 'center'>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [mapNotice, setMapNotice] = useState<string | null>(null);
  const [today] = useState(localToday);

  const data = useMemo(() => (imports ? mergeDatasets(seed, imports) : seed), [seed, imports]);
  const histories = useMemo(() => surveyHistories(data), [data]);
  const patterns = useMemo(() => findPatterns(data), [data]);

  const months = useMemo(() => monthRange(today.slice(0, 7), 24), [today]);
  const rows = useMemo(() => monthlyActivity(data, months), [data, months]);
  const windowEntries = useMemo(() => data.entries.filter((e) => e.date.slice(0, 7) >= months[0]), [data, months]);

  const stats = useMemo(() => {
    let sales = 0;
    let chargeIn = 0;
    let chargeOut = 0;
    let open = 0;
    for (const e of windowEntries) {
      const info = entryTypeInfo(e.typeGu);
      if (info.category === 'sale') sales++;
      if (info.charge === 'in') chargeIn++;
      if (info.charge === 'out') chargeOut++;
      if (objectionWindow(e, today).daysLeft >= 0) open++;
    }
    return { sales, chargeIn, chargeOut, open };
  }, [windowEntries, today]);

  const center = centerOverride ?? village.approxCenter;

  const describe = useCallback(
    (survey: string) => {
      const h = histories.get(survey);
      const last = h?.entries[h.entries.length - 1];
      if (!last) return { category: 'other' as const, label: 'No notices in imported months' };
      const info = entryTypeInfo(last.typeGu);
      return { category: info.category, label: `${info.en} · entry ${last.entryNo} · ${last.date.split('-').reverse().join('/')}` };
    },
    [histories]
  );
  const mapPins = useMemo(() => pinMapToList(pins, describe), [pins, describe]);
  const unpinned = useMemo(() => [...histories.keys()].filter((s) => !pins[s]).length, [histories, pins]);

  function updatePins(next: PinMap) {
    setPins(next);
    landStorage.savePins(seed, next);
  }

  const onPlace = useCallback(
    (ll: { lat: number; lng: number }) => {
      if (placing === 'center') {
        setCenterOverride(ll);
        landStorage.saveCenter(seed, ll);
      } else if (placing === 'pin' && selected) {
        const next = { ...pins, [selected]: { lat: ll.lat, lng: ll.lng, note: pins[selected]?.note } };
        setPins(next);
        landStorage.savePins(seed, next);
      }
      setPlacing(null);
    },
    [placing, selected, pins, seed]
  );

  function select(survey: string) {
    setSelected(survey);
    setPlacing(null);
    setGpsError(null);
  }

  function pinAtGps() {
    if (!selected) return;
    if (!('geolocation' in navigator)) {
      setGpsError('This browser cannot share its location.');
      return;
    }
    const survey = selected;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const acc = Math.round(pos.coords.accuracy);
        updatePins({ ...pins, [survey]: { lat: pos.coords.latitude, lng: pos.coords.longitude, note: `GPS on site (±${acc} m)` } });
        setGpsError(null);
      },
      (err) => setGpsError(`Location unavailable: ${err.message}`),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  function onImport(pages: ParsedPage[]): string {
    const before = new Set(data.entries.map((e) => e.entryNo));
    const base: LandDataset = imports ?? { district: seed.district, taluka: seed.taluka, village: seed.village, months: [], entries: [] };
    const next = mergeDatasets(base, ...pages); // throws if a page is for another village
    setImports(next);
    const saved = landStorage.saveImports(seed, next);
    const added = next.entries.filter((e) => !before.has(e.entryNo)).length;
    return `${added} new notices added.${saved ? '' : ' This browser blocked storage, so they will be gone after a reload; download the dataset to keep them.'}`;
  }

  function importPins(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    f.text()
      .then((t) => {
        const loaded = pinsFromGeoJson(t);
        updatePins({ ...pins, ...loaded });
        setMapNotice(`Loaded ${Object.keys(loaded).length} pins from ${f.name}.`);
      })
      .catch(() => setMapNotice(`${f.name} is not a GeoJSON export of survey pins.`));
  }

  const first = data.months[0];
  const last = data.months[data.months.length - 1];
  const fileBase = `${village.en.village.toLowerCase().replace(/\s+/g, '-')}-${village.anyrorCode}`;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Notices, last 24 months" value={windowEntries.length} sub={first ? `Imported: ${monthName(first)} – ${monthName(last)}` : 'Nothing imported'} />
        <Stat label="Sale & gift entries" value={stats.sales} />
        <Stat label="Loan charges entered / released" value={`${stats.chargeIn} / ${stats.chargeOut}`} />
        <Stat label="Objection window likely open" value={stats.open} sub="Entry date + 30 days" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="p-4 md:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-lg font-semibold text-zinc-100">Map</h3>
              <p className="text-xs text-zinc-500">
                {Object.keys(pins).length} survey nos. pinned · {unpinned} in the notices not pinned yet
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className={cn(smallBtn, placing === 'center' && 'border-accent/60 text-accent')} onClick={() => setPlacing(placing === 'center' ? null : 'center')}>
                {placing === 'center' ? 'Click the map… (cancel)' : 'Set village centre'}
              </button>
              <button className={smallBtn} onClick={() => downloadText(`${fileBase}-pins.kml`, pinsToKml(data, pins), 'application/vnd.google-earth.kml+xml')} disabled={!mapPins.length}>
                <Download className="h-3.5 w-3.5" /> KML
              </button>
              <button className={smallBtn} onClick={() => downloadText(`${fileBase}-pins.geojson`, pinsToGeoJson(data, pins), 'application/geo+json')} disabled={!mapPins.length}>
                <Download className="h-3.5 w-3.5" /> GeoJSON
              </button>
              <label className={cn(smallBtn, 'cursor-pointer')}>
                <Upload className="h-3.5 w-3.5" /> Load pins
                <input type="file" accept=".geojson,.json,application/geo+json" className="sr-only" onChange={(e) => importPins(e.target.files)} />
              </label>
            </div>
          </div>
          <LandMap
            center={center}
            centerLabel={centerOverride ? 'Village centre (set by you)' : `Approximate village location: ${village.approxCenter.source}`}
            pins={mapPins}
            selected={selected}
            placing={placing !== null}
            onPlace={onPlace}
            onSelect={select}
          />
          {mapNotice && <p className="mt-2 text-xs text-zinc-300">{mapNotice}</p>}
          <p className="mt-2 text-xs text-zinc-500">
            e-Chavdi lists survey numbers, not coordinates, and plot boundaries need the official village map. Pick a survey number from the
            notices, check where it lies on the AnyRoR / survey office village map, then pin it here once. Pins stay in this browser; export
            KML to open them in Google Earth. The dashed ring marks the approximate village location only.
            {!centerOverride && ` ${village.approxCenter.caveat}`}
          </p>
        </Card>

        <Card className="p-4 md:p-5">
          {selected ? (
            <SurveyPanel
              survey={selected}
              history={histories.get(selected)}
              pin={pins[selected]}
              placing={placing === 'pin'}
              gpsError={gpsError}
              onStartPlacing={() => setPlacing('pin')}
              onCancelPlacing={() => setPlacing(null)}
              onUseGps={pinAtGps}
              onRemovePin={() => {
                const next = { ...pins };
                delete next[selected];
                updatePins(next);
              }}
            />
          ) : (
            <div className="space-y-3 text-sm text-zinc-400">
              <Layers className="h-5 w-5 text-accent" />
              <p className="text-zinc-200">Select a survey number</p>
              <p>Click a survey number in the notices below, or a pin on the map, to see its entries and place it on the map.</p>
            </div>
          )}
        </Card>
      </div>

      <Card className="p-4 md:p-5">
        <h3 className="text-lg font-semibold text-zinc-100">Notices per month</h3>
        <p className="mb-4 text-xs text-zinc-500">Mutation entries published on e-Chavdi, by type, for the last 24 months.</p>
        <ActivityChart rows={rows} />
      </Card>

      <Card className="p-4 md:p-5">
        <h3 className="text-lg font-semibold text-zinc-100">Sequences worth a closer look</h3>
        <p className="mb-4 text-xs text-zinc-500">
          Patterns in the order of public notices. They describe what the register shows, not why, and are not a judgement on any parcel or
          person.
        </p>
        {patterns.length === 0 ? (
          <p className="text-sm text-zinc-500">None in the imported months.</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {patterns.map((p) => (
              <li key={p.id} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                <p className="text-sm font-medium text-zinc-100">{p.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-400">{p.detail}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {p.surveys.map((s) => (
                    <button key={s} onClick={() => select(s)} className="rounded border border-zinc-700 px-1.5 py-0.5 text-xs text-zinc-300 hover:border-zinc-500">
                      {s}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4 md:p-5">
        <h3 className="mb-4 text-lg font-semibold text-zinc-100">Notices</h3>
        <EntriesTable entries={data.entries} pins={pins} today={today} selected={selected} onSelect={select} />
      </Card>

      <Card className="p-4 md:p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold text-zinc-100">Add months</h3>
            <p className="text-xs text-zinc-500">Imported pages are kept in this browser and merged with the built-in data.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className={smallBtn}
              onClick={() => downloadText(`${fileBase}-echavdi.json`, JSON.stringify([data], null, 1) + '\n', 'application/json')}
            >
              <Download className="h-3.5 w-3.5" /> Dataset JSON
            </button>
            {imports && (
              <button
                className={smallBtn}
                onClick={() => {
                  setImports(null);
                  landStorage.saveImports(seed, null);
                }}
              >
                <Eraser className="h-3.5 w-3.5" /> Clear imported
              </button>
            )}
          </div>
        </div>
        <ImportPanel onImport={onImport} />
      </Card>

    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Eraser, Layers, Sparkles, Upload } from 'lucide-react';
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
  normaliseSurvey,
  objectionWindow,
  pinsFromGeoJson,
  pinsToGeoJson,
  pinsToKml,
  relateAll,
  surveyHistories,
} from '@/lib/land';
import { Backup, NearbySettings, downloadText, landStorage, makeBackup, restoreBackup } from '@/lib/land-storage';
import { OverlaySheet, XY, blobToDataUrl, dataUrlToBlob, imageSize, minAngleDeg, overlayStore, solveAffine } from '@/lib/overlay';
import { villageId } from '@/lib/land';
import type { VillageConfig } from '@/data/land/villages';
import { cn } from '@/lib/utils';
import { ActivityChart, monthName } from './ActivityChart';
import { EntriesTable } from './EntriesTable';
import { ImportPanel } from './ImportPanel';
import { LandMap, pinMapToList } from './LandMap';
import { MyLandCard } from './MyLandCard';
import { WatchCard } from './WatchCard';
import { AlignState, ViewSheet, VillageMapSheets } from './VillageMapSheets';
import type { WatchFeed } from '@/lib/watch';
import { BoundaryCollection, ShapeLayer, planKmlImport, readKmlFile } from '@/lib/geo';
import { ImportedShapes } from './ImportedShapes';
import { SurveyPanel } from './SurveyPanel';

interface LandDashboardProps {
  village: VillageConfig;
  seed: LandDataset;
  watch: WatchFeed;
  /** Public outline of the village and its neighbours, when the boundary data has it. */
  boundary?: BoundaryCollection;
  boundaryAttribution?: string;
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

export function LandDashboard({ village, seed, watch, boundary, boundaryAttribution = '' }: LandDashboardProps) {
  // This component only renders in the browser (see LandLoader), so storage is safe to read here.
  const [imports, setImports] = useState<LandDataset | null>(() => landStorage.loadImports(seed));
  const [pins, setPins] = useState<PinMap>(() => landStorage.loadPins(seed));
  const [centerOverride, setCenterOverride] = useState(() => landStorage.loadCenter(seed));
  const [selected, setSelected] = useState<string | null>(null);
  const [placing, setPlacing] = useState<null | 'pin' | 'center' | 'align'>(null);
  const [sheets, setSheets] = useState<ViewSheet[]>([]);
  const [align, setAlign] = useState<AlignState | null>(null);
  const [sheetNotice, setSheetNotice] = useState<string | null>(null);
  const opacityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [mapNotice, setMapNotice] = useState<string | null>(null);
  const [today] = useState(localToday);
  const [myLand, setMyLand] = useState<string[]>(() => landStorage.loadMyLand(seed));
  const [nearby, setNearby] = useState<NearbySettings>(() => landStorage.loadNearby(seed));
  // Notices present at the end of the previous visit; null on a first visit.
  const [seenBefore] = useState(() => landStorage.loadSeen(seed));
  const [backupNotice, setBackupNotice] = useState<string | null>(null);
  const [shapeLayers, setShapeLayers] = useState<ShapeLayer[]>(() => landStorage.loadShapes(seed));

  const data = useMemo(() => (imports ? mergeDatasets(seed, imports) : seed), [seed, imports]);

  // Remember what this visit has seen, for "new since last visit" next time.
  useEffect(() => {
    landStorage.saveSeen(seed, data.entries.map((e) => e.entryNo));
  }, [seed, data]);

  const fresh = useMemo(() => {
    if (!seenBefore) return new Set<number>();
    const seen = new Set(seenBefore);
    return new Set(data.entries.filter((e) => !seen.has(e.entryNo)).map((e) => e.entryNo));
  }, [data, seenBefore]);

  const relations = useMemo(
    () => relateAll(data.entries, myLand, { pins, radiusKm: nearby.radiusKm, numberWindow: nearby.numberWindow }),
    [data, myLand, pins, nearby]
  );
  const mySet = useMemo(() => new Set(myLand), [myLand]);
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
      const mine = mySet.has(normaliseSurvey(survey));
      const h = histories.get(survey);
      const last = h?.entries[h.entries.length - 1];
      if (!last) return { category: 'other' as const, label: 'No notices in imported months', mine };
      const info = entryTypeInfo(last.typeGu);
      return { category: info.category, label: `${info.en} · entry ${last.entryNo} · ${last.date.split('-').reverse().join('/')}`, mine };
    },
    [histories, mySet]
  );
  const mapPins = useMemo(() => pinMapToList(pins, describe), [pins, describe]);
  const mapShapes = useMemo(
    () => shapeLayers.filter((l) => l.visible).flatMap((l) => l.shapes.map((s) => ({ ...s, mine: !!s.survey && mySet.has(s.survey) }))),
    [shapeLayers, mySet]
  );
  const mapBoundary = useMemo(() => (boundary ? { data: boundary, attribution: boundaryAttribution } : undefined), [boundary, boundaryAttribution]);
  const unpinned = useMemo(() => [...histories.keys()].filter((s) => !pins[s]).length, [histories, pins]);

  function updateMyLand(next: string[]) {
    setMyLand(next);
    landStorage.saveMyLand(seed, next);
  }

  function updateNearby(next: NearbySettings) {
    setNearby(next);
    landStorage.saveNearby(seed, next);
  }

  function restore(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    f.text()
      .then(async (t) => {
        const b = restoreBackup(seed, t);
        for (const o of b.overlays ?? []) {
          await overlayStore.put({
            id: o.id,
            village: villageId(seed),
            name: o.name,
            image: await dataUrlToBlob(o.dataUrl),
            width: o.width,
            height: o.height,
            points: o.points,
            opacity: o.opacity,
            visible: o.visible,
            added: o.added,
          });
        }
        window.location.reload();
      })
      .catch((e: Error) => setBackupNotice(e.message || `${f.name} could not be read.`));
  }

  // Village map sheets live in IndexedDB; load them once and give each an object URL.
  useEffect(() => {
    let alive = true;
    let made: ViewSheet[] = [];
    overlayStore
      .list(seed)
      .then((list) => {
        if (!alive) return;
        made = list.map((o) => ({ ...o, url: URL.createObjectURL(o.image) }));
        setSheets(made);
      })
      .catch(() => setSheetNotice('This browser could not open its storage for map sheets.'));
    return () => {
      alive = false;
      made.forEach((s) => URL.revokeObjectURL(s.url));
    };
  }, [seed]);

  function saveSheet(next: ViewSheet) {
    setSheets((all) => all.map((s) => (s.id === next.id ? next : s)));
    const { url: _url, ...stored } = next;
    void _url;
    return overlayStore.put(stored).catch(() => setSheetNotice('Could not save the sheet in this browser.'));
  }

  async function uploadSheets(files: FileList) {
    setSheetNotice(null);
    for (const f of Array.from(files)) {
      try {
        const { width, height } = await imageSize(f);
        const sheet: OverlaySheet = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          village: villageId(seed),
          name: f.name,
          image: f,
          width,
          height,
          points: [],
          opacity: 0.7,
          visible: true,
          added: new Date().toISOString(),
        };
        await overlayStore.put(sheet);
        setSheets((all) => [...all, { ...sheet, url: URL.createObjectURL(f) }]);
        if (width < 2500) {
          setSheetNotice(`${f.name} is ${width}×${height} pixels; survey numbers may be too small to read. A full-resolution scan works better.`);
        }
      } catch (e) {
        setSheetNotice((e as Error).message);
      }
    }
  }

  function startAlign(id: string) {
    setAlign({ id, img: [], geo: [] });
    setPlacing(null);
    setSheetNotice(null);
  }

  function cancelAlign() {
    setAlign(null);
    if (placing === 'align') setPlacing(null);
  }

  function pickImagePoint(p: XY) {
    if (!align || align.img.length !== align.geo.length || align.img.length >= 3) return;
    setAlign({ ...align, img: [...align.img, p] });
    setPlacing('align');
  }

  function finishAlign(a: AlignState) {
    const sheet = sheets.find((s) => s.id === a.id);
    setAlign(null);
    if (!sheet) return;
    const img = a.img as [XY, XY, XY];
    const geo = a.geo.map((g) => ({ x: g.lng, y: -g.lat })) as [XY, XY, XY];
    if (!solveAffine(img, geo) || !solveAffine(geo, img)) {
      setSheetNotice('Those three points lie almost on a line, so the sheet cannot be placed. Align again with points spread out like a triangle.');
      return;
    }
    const thin = Math.min(minAngleDeg(img), minAngleDeg(geo)) < 15;
    void saveSheet({ ...sheet, points: img.map((p, i) => ({ img: p, geo: a.geo[i] })), visible: true });
    setSheetNotice(
      thin
        ? 'Aligned, but the three points form a thin triangle, so the far corners may be off. Re-align with points spread wider if it looks wrong.'
        : 'Aligned. Check a few roads and boundaries against the satellite view; old sheets can be off by some metres locally.'
    );
  }

  function updatePins(next: PinMap) {
    setPins(next);
    landStorage.savePins(seed, next);
  }

  const onPlace = useCallback(
    (ll: { lat: number; lng: number }) => {
      if (placing === 'align' && align) {
        const next = { ...align, geo: [...align.geo, ll] };
        setPlacing(null);
        if (next.geo.length === 3) finishAlign(next);
        else setAlign(next);
        return;
      }
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
    // finishAlign reads the latest sheets through this closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [placing, selected, pins, seed, align, sheets]
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

  function updateShapes(next: ShapeLayer[]) {
    setShapeLayers(next);
    return landStorage.saveShapes(seed, next);
  }

  async function importKml(f: File) {
    try {
      const r = planKmlImport(await readKmlFile(f), f.name, { boundary, pins });
      const pinned = Object.keys(r.newPins);
      if (pinned.length) updatePins({ ...pins, ...r.newPins });
      const saved = r.layer.shapes.length ? updateShapes([...shapeLayers, r.layer]) : true;
      const parts = [
        `${f.name}: ${r.layer.shapes.length} shape${r.layer.shapes.length === 1 ? '' : 's'} added`,
        pinned.length ? `pinned survey ${pinned.join(', ')}` : 'no new survey pins',
      ];
      if (r.kept.length) parts.push(`kept your existing pin for ${r.kept.join(', ')} (remove it first to use the file's position)`);
      if (r.skippedKnown) parts.push(`${r.skippedKnown} village outline${r.skippedKnown === 1 ? '' : 's'} or label${r.skippedKnown === 1 ? '' : 's'} skipped, already on the map`);
      if (r.imageOverlays) parts.push(`${r.imageOverlays} picture overlay${r.imageOverlays === 1 ? '' : 's'} skipped (Google Earth keeps the picture online; add the scan under Village map sheets)`);
      if (r.outside.length) parts.push(`check ${r.outside.join(', ')}: outside the village outline`);
      setMapNotice(parts.join('; ') + '.' + (saved ? '' : ' This browser blocked storage, so the shapes will be gone after a reload.'));
    } catch (e) {
      setMapNotice(`${f.name}: ${(e as Error).message}`);
    }
  }

  function importPins(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    if (/\.km[lz]$/i.test(f.name)) {
      void importKml(f);
      return;
    }
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
      {fresh.size > 0 && (
        <p className="flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-200">
          <Sparkles className="h-4 w-4 shrink-0" />
          {fresh.size} new notice{fresh.size === 1 ? '' : 's'} since your last visit. They are marked NEW in the table below.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Notices, last 24 months" value={windowEntries.length} sub={first ? `Imported: ${monthName(first)} – ${monthName(last)}` : 'Nothing imported'} />
        <Stat label="Sale & gift entries" value={stats.sales} />
        <Stat label="Loan charges entered / released" value={`${stats.chargeIn} / ${stats.chargeOut}`} />
        <Stat label="Objection window likely open" value={stats.open} sub="Entry date + 30 days" />
      </div>

      <MyLandCard
        myLand={myLand}
        onChangeMyLand={updateMyLand}
        entries={data.entries}
        relations={relations}
        nearby={nearby}
        onChangeNearby={updateNearby}
        pins={pins}
        today={today}
        monthsImported={data.months.length}
        onSelect={select}
      />

      <WatchCard feed={watch} village={seed} myLand={myLand} lastNoticeMonth={data.months[data.months.length - 1]} today={today} />

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
                <Upload className="h-3.5 w-3.5" /> Import KML / pins
                <input
                  type="file"
                  accept=".kml,.kmz,.geojson,.json,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz,application/geo+json"
                  className="sr-only"
                  onChange={(e) => {
                    importPins(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          </div>
          <LandMap
            center={center}
            centerLabel={centerOverride ? 'Village centre (set by you)' : `Approximate village location: ${village.approxCenter.source}`}
            pins={mapPins}
            selected={selected}
            myRadiusKm={myLand.length ? nearby.radiusKm : 0}
            placing={placing !== null}
            onPlace={onPlace}
            onSelect={select}
            overlays={sheets
              .filter((s) => s.visible && s.points.length === 3 && s.id !== align?.id)
              .map((s) => ({ id: s.id, url: s.url, points: s.points, opacity: s.opacity }))}
            alignPoints={align?.geo}
            boundary={mapBoundary}
            shapes={mapShapes}
          />
          <ImportedShapes
            layers={shapeLayers}
            onToggle={(id) => updateShapes(shapeLayers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)))}
            onRemove={(id) => {
              const l = shapeLayers.find((x) => x.id === id);
              if (l && window.confirm(`Remove the shapes from ${l.name}? Pins made from it stay.`)) updateShapes(shapeLayers.filter((x) => x.id !== id));
            }}
          />
          <VillageMapSheets
            sheets={sheets}
            align={align}
            notice={sheetNotice}
            onUpload={uploadSheets}
            onToggle={(id) => {
              const s = sheets.find((x) => x.id === id);
              if (s) void saveSheet({ ...s, visible: !s.visible });
            }}
            onOpacity={(id, opacity) => {
              setSheets((all) => all.map((s) => (s.id === id ? { ...s, opacity } : s)));
              if (opacityTimer.current) clearTimeout(opacityTimer.current);
              opacityTimer.current = setTimeout(() => {
                const s = sheets.find((x) => x.id === id);
                if (s) void saveSheet({ ...s, opacity });
              }, 400);
            }}
            onRemove={(id) => {
              const s = sheets.find((x) => x.id === id);
              if (!s || !window.confirm(`Remove ${s.name} from this browser?`)) return;
              URL.revokeObjectURL(s.url);
              setSheets((all) => all.filter((x) => x.id !== id));
              if (align?.id === id) cancelAlign();
              void overlayStore.remove(id);
            }}
            onStartAlign={startAlign}
            onCancelAlign={cancelAlign}
            onPickImage={pickImagePoint}
          />
          {mapNotice && <p className="mt-2 text-xs text-zinc-300">{mapNotice}</p>}
          <p className="mt-2 text-xs text-zinc-500">
            e-Chavdi lists survey numbers, not coordinates, and plot boundaries need the official village map. Pick a survey number from the
            notices, check where it lies on the AnyRoR / survey office village map, then pin it here once. Pins stay in this browser; export
            KML to open them in Google Earth.
            {boundary
              ? ' The gold line is the village boundary and the dashed lines its neighbours, from DataMeet (Census 2001 maps): good for orientation, not a legal boundary, and off by tens of metres in places. Import a KML or KMZ from Google Earth to add your own outlines; placemarks named like "Survey No. 58" become pins.'
              : ` The dashed ring marks the approximate village location only.${centerOverride ? '' : ` ${village.approxCenter.caveat}`}`}
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
        <EntriesTable entries={data.entries} pins={pins} today={today} selected={selected} onSelect={select} relations={relations} fresh={fresh} />
      </Card>

      <Card className="p-4 md:p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold text-zinc-100">Add months</h3>
            <p className="text-xs text-zinc-500">
              Imported pages are kept in this browser and merged with the built-in data. To show them on the live site for everyone, download
              the dataset JSON and publish it (see the README).
            </p>
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

      <Card className="p-4 md:p-5">
        <h3 className="text-lg font-semibold text-zinc-100">Move to another device</h3>
        <p className="mt-1 text-sm text-zinc-400">
          Your land, pins, map centre, nearby settings, imported shapes, village map sheets and imported months live only in this browser. Download a backup and restore it on your
          phone or another computer. Keep the file private: it lists your survey numbers.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className={smallBtn}
            onClick={async () => {
              const backup: Backup = {
                ...makeBackup(seed),
                overlays: await Promise.all(
                  sheets.map(async (s) => ({
                    id: s.id,
                    name: s.name,
                    dataUrl: await blobToDataUrl(s.image),
                    width: s.width,
                    height: s.height,
                    points: s.points,
                    opacity: s.opacity,
                    visible: s.visible,
                    added: s.added,
                  }))
                ),
              };
              downloadText(`${fileBase}-backup.json`, JSON.stringify(backup) + '\n', 'application/json');
            }}
          >
            <Download className="h-3.5 w-3.5" /> Download backup
          </button>
          <label className={cn(smallBtn, 'cursor-pointer')}>
            <Upload className="h-3.5 w-3.5" /> Restore backup
            <input type="file" accept=".json,application/json" className="sr-only" onChange={(e) => restore(e.target.files)} />
          </label>
        </div>
        {backupNotice && <p className="mt-2 text-xs text-rose-400">{backupNotice}</p>}
      </Card>

    </div>
  );
}

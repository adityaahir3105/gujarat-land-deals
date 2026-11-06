'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Eraser, Layers, Sparkles, Upload } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import {
  LandDataset,
  ParsedPage,
  PinMap,
  entryTypeGu,
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
import { useLang, useT } from '@/lib/i18n';
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
  const lang = useLang();
  const isGu = lang === 'gu';
  const t = useT();

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
      if (!last) return { category: 'other' as const, label: t('No notices in imported months', 'ઉમેરેલા મહિનામાં કોઈ નોંધ નથી'), mine };
      const info = entryTypeInfo(last.typeGu);
      const date = last.date.split('-').reverse().join('/');
      return {
        category: info.category,
        label: isGu ? `${entryTypeGu(last.typeGu)} · નોંધ ${last.entryNo} · ${date}` : `${info.en} · entry ${last.entryNo} · ${date}`,
        mine,
      };
    },
    [histories, mySet, t, isGu]
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
      .then(async (text) => {
        const b = restoreBackup(seed, text);
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
      .catch((e: Error) => setBackupNotice(e.message || t(`${f.name} could not be read.`, `${f.name} વાંચી શકાઈ નહીં.`)));
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
      .catch(() => setSheetNotice(t('This browser could not open its storage for map sheets.', 'આ બ્રાઉઝર નકશાનાં પાનાં માટે સંગ્રહ ખોલી શક્યું નહીં.')));
    return () => {
      alive = false;
      made.forEach((s) => URL.revokeObjectURL(s.url));
    };
    // Load once per village; a language switch must not reload the sheets (t only words the error).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  function saveSheet(next: ViewSheet) {
    setSheets((all) => all.map((s) => (s.id === next.id ? next : s)));
    const { url: _url, ...stored } = next;
    void _url;
    return overlayStore.put(stored).catch(() => setSheetNotice(t('Could not save the sheet in this browser.', 'આ બ્રાઉઝરમાં પાનું સાચવી શકાયું નહીં.')));
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
          setSheetNotice(
            t(
              `${f.name} is ${width}×${height} pixels; survey numbers may be too small to read. A full-resolution scan works better.`,
              `${f.name} ${width}×${height} પિક્સેલ છે; સર્વે નંબર કદાચ વંચાશે નહીં. પૂરા રિઝોલ્યુશનનું સ્કેન વધુ સારું.`
            )
          );
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
      setSheetNotice(
        t(
          'Those three points lie almost on a line, so the sheet cannot be placed. Align again with points spread out like a triangle.',
          'આ ત્રણ બિંદુ લગભગ એક લીટીમાં છે, એટલે પાનું ગોઠવી શકાતું નથી. ત્રિકોણની જેમ દૂર દૂર બિંદુ લઈને ફરી મેળવો.'
        )
      );
      return;
    }
    const thin = Math.min(minAngleDeg(img), minAngleDeg(geo)) < 15;
    void saveSheet({ ...sheet, points: img.map((p, i) => ({ img: p, geo: a.geo[i] })), visible: true });
    setSheetNotice(
      thin
        ? t(
            'Aligned, but the three points form a thin triangle, so the far corners may be off. Re-align with points spread wider if it looks wrong.',
            'મેળવ્યું, પણ ત્રણ બિંદુનો ત્રિકોણ સાંકડો છે, એટલે દૂરના ખૂણા ખસેલા હોઈ શકે. ખોટું લાગે તો વધુ દૂર બિંદુ લઈને ફરી મેળવો.'
          )
        : t(
            'Aligned. Check a few roads and boundaries against the satellite view; old sheets can be off by some metres locally.',
            'મેળવ્યું. થોડા રસ્તા અને હદ સેટેલાઇટ નકશા સાથે સરખાવો; જૂનાં પાનાં અમુક જગ્યાએ થોડા મીટર ખસેલાં હોઈ શકે.'
          )
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
      setGpsError(t('This browser cannot share its location.', 'આ બ્રાઉઝર સ્થાન આપી શકતું નથી.'));
      return;
    }
    const survey = selected;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const acc = Math.round(pos.coords.accuracy);
        updatePins({ ...pins, [survey]: { lat: pos.coords.latitude, lng: pos.coords.longitude, note: t(`GPS on site (±${acc} m)`, `સ્થળ પર GPS (±${acc} m)`) } });
        setGpsError(null);
      },
      (err) => setGpsError(t(`Location unavailable: ${err.message}`, `સ્થાન મળ્યું નહીં: ${err.message}`)),
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
    return saved
      ? t(`${added} new notices added.`, `${added} નવી નોંધ ઉમેરી.`)
      : t(
          `${added} new notices added. This browser blocked storage, so they will be gone after a reload; download the dataset to keep them.`,
          `${added} નવી નોંધ ઉમેરી. આ બ્રાઉઝરે સંગ્રહ બંધ રાખ્યો છે, એટલે ફરી ખોલતાં જતી રહેશે; રાખવા માટે Dataset JSON ડાઉનલોડ કરો.`
        );
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
      const n = r.layer.shapes.length;
      const parts = [
        t(`${f.name}: ${n} shape${n === 1 ? '' : 's'} added`, `${f.name}: ${n} આકાર ઉમેર્યા`),
        pinned.length ? t(`pinned survey ${pinned.join(', ')}`, `સર્વે ${pinned.join(', ')} નકશા પર મૂક્યા`) : t('no new survey pins', 'કોઈ નવો સર્વે પિન નથી'),
      ];
      if (r.kept.length) {
        parts.push(
          t(
            `kept your existing pin for ${r.kept.join(', ')} (remove it first to use the file's position)`,
            `${r.kept.join(', ')} માટે તમારો હાલનો પિન રાખ્યો (ફાઇલનું સ્થાન જોઈએ તો પહેલાં એ પિન કાઢો)`
          )
        );
      }
      if (r.skippedKnown) {
        parts.push(
          t(
            `${r.skippedKnown} village outline${r.skippedKnown === 1 ? '' : 's'} or label${r.skippedKnown === 1 ? '' : 's'} skipped, already on the map`,
            `${r.skippedKnown} ગામની હદ કે નામ છોડ્યાં, નકશા પર પહેલેથી છે`
          )
        );
      }
      if (r.imageOverlays) {
        parts.push(
          t(
            `${r.imageOverlays} picture overlay${r.imageOverlays === 1 ? '' : 's'} skipped (Google Earth keeps the picture online; add the scan under Village map sheets)`,
            `${r.imageOverlays} ચિત્ર છોડ્યું (Google Earth ચિત્ર ઓનલાઇન રાખે છે; સ્કેન “ગામ નકશાનાં પાનાં”માં ઉમેરો)`
          )
        );
      }
      if (r.outside.length) parts.push(t(`check ${r.outside.join(', ')}: outside the village outline`, `${r.outside.join(', ')} તપાસો: ગામની હદ બહાર છે`));
      setMapNotice(
        parts.join('; ') +
          '.' +
          (saved ? '' : t(' This browser blocked storage, so the shapes will be gone after a reload.', ' આ બ્રાઉઝરે સંગ્રહ બંધ રાખ્યો છે, એટલે ફરી ખોલતાં આકાર જતા રહેશે.'))
      );
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
      .then((text) => {
        const loaded = pinsFromGeoJson(text);
        updatePins({ ...pins, ...loaded });
        setMapNotice(t(`Loaded ${Object.keys(loaded).length} pins from ${f.name}.`, `${f.name}માંથી ${Object.keys(loaded).length} પિન ઉમેર્યા.`));
      })
      .catch(() => setMapNotice(t(`${f.name} is not a GeoJSON export of survey pins.`, `${f.name} સર્વે પિનની GeoJSON ફાઇલ નથી.`)));
  }

  const first = data.months[0];
  const last = data.months[data.months.length - 1];
  const fileBase = `${village.en.village.toLowerCase().replace(/\s+/g, '-')}-${village.anyrorCode}`;

  return (
    <div className="space-y-6">
      {fresh.size > 0 && (
        <p className="flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-200">
          <Sparkles className="h-4 w-4 shrink-0" />
          {t(
            `${fresh.size} new notice${fresh.size === 1 ? '' : 's'} since your last visit. They are marked NEW in the table below.`,
            `છેલ્લી મુલાકાત પછી ${fresh.size} નવી નોંધ. નીચેના કોષ્ટકમાં “નવી” લખેલું છે.`
          )}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={t('Notices, last 24 months', 'નોંધ, છેલ્લા 24 મહિના')}
          value={windowEntries.length}
          sub={first ? `${t('Imported', 'ઉમેરેલા')}: ${monthName(first, true, lang)} – ${monthName(last, true, lang)}` : t('Nothing imported', 'કંઈ ઉમેર્યું નથી')}
        />
        <Stat label={t('Sale & gift entries', 'વેચાણ અને બક્ષિસ નોંધ')} value={stats.sales} />
        <Stat label={t('Loan charges entered / released', 'બોજો દાખલ / મુક્તિ')} value={`${stats.chargeIn} / ${stats.chargeOut}`} />
        <Stat label={t('Objection window likely open', 'વાંધા અરજીની મુદત કદાચ ચાલુ')} value={stats.open} sub={t('Entry date + 30 days', 'નોંધની તારીખ + 30 દિવસ')} />
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
              <h3 className="text-lg font-semibold text-zinc-100">{t('Map', 'નકશો')}</h3>
              <p className="text-xs text-zinc-500">
                {t(
                  `${Object.keys(pins).length} survey nos. pinned · ${unpinned} in the notices not pinned yet`,
                  `${Object.keys(pins).length} સર્વે નં. નકશા પર · નોંધોમાંના ${unpinned} હજુ નકશા પર નથી`
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className={cn(smallBtn, placing === 'center' && 'border-accent/60 text-accent')} onClick={() => setPlacing(placing === 'center' ? null : 'center')}>
                {placing === 'center' ? t('Click the map… (cancel)', 'નકશા પર ક્લિક કરો… (રદ)') : t('Set village centre', 'ગામનું કેન્દ્ર બદલો')}
              </button>
              <button className={smallBtn} onClick={() => downloadText(`${fileBase}-pins.kml`, pinsToKml(data, pins), 'application/vnd.google-earth.kml+xml')} disabled={!mapPins.length}>
                <Download className="h-3.5 w-3.5" /> KML
              </button>
              <button className={smallBtn} onClick={() => downloadText(`${fileBase}-pins.geojson`, pinsToGeoJson(data, pins), 'application/geo+json')} disabled={!mapPins.length}>
                <Download className="h-3.5 w-3.5" /> GeoJSON
              </button>
              <label className={cn(smallBtn, 'cursor-pointer')}>
                <Upload className="h-3.5 w-3.5" /> {t('Import KML / pins', 'KML / પિન ઉમેરો')}
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
            centerLabel={
              centerOverride
                ? t('Village centre (set by you)', 'ગામનું કેન્દ્ર (તમે મૂકેલું)')
                : t(`Approximate village location: ${village.approxCenter.source}`, `ગામનું અંદાજિત સ્થાન: ${village.approxCenter.source}`)
            }
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
              if (l && window.confirm(t(`Remove the shapes from ${l.name}? Pins made from it stay.`, `${l.name}ના આકાર કાઢવા છે? તેમાંથી બનેલા પિન રહેશે.`))) {
                updateShapes(shapeLayers.filter((x) => x.id !== id));
              }
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
              if (!s || !window.confirm(t(`Remove ${s.name} from this browser?`, `${s.name} આ બ્રાઉઝરમાંથી કાઢવું છે?`))) return;
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
            {t(
              'e-Chavdi lists survey numbers, not coordinates, and plot boundaries need the official village map. Pick a survey number from the notices, check where it lies on the AnyRoR / survey office village map, then pin it here once. Pins stay in this browser; export KML to open them in Google Earth.',
              'ઈ-ચાવડીમાં સર્વે નંબર હોય છે, નકશાનું સ્થાન નહીં; ખેતરની હદ માટે સરકારી ગામ નકશો જોઈએ. નોંધમાંથી સર્વે નંબર પસંદ કરો, AnyRoR / જમીન દફતર કચેરીના ગામ નકશામાં તે ક્યાં છે તે જુઓ, પછી અહીં એક વાર પિન કરો. પિન આ બ્રાઉઝરમાં રહે છે; Google Earthમાં ખોલવા KML ડાઉનલોડ કરો.'
            )}
            {boundary
              ? t(
                  ' The gold line is the village boundary and the dashed lines its neighbours, from DataMeet (Census 2001 maps): good for orientation, not a legal boundary, and off by tens of metres in places. Import a KML or KMZ from Google Earth to add your own outlines; placemarks named like "Survey No. 58" become pins.',
                  ' સોનેરી રેખા ગામની હદ છે અને તૂટક રેખા પડોશી ગામોની, DataMeet (વસ્તી ગણતરી 2001ના નકશા) પરથી: દિશા સમજવા માટે સારી, કાનૂની હદ નથી, અને અમુક જગ્યાએ દસેક મીટર ખસેલી હોઈ શકે. Google Earthની KML કે KMZ ઉમેરીને તમારી પોતાની રેખાઓ મૂકો; "Survey No. 58" કે "સર્વે નં. 58" જેવા નામવાળાં નિશાન પિન બને છે.'
                )
              : t(
                  ` The dashed ring marks the approximate village location only.${centerOverride ? '' : ` ${village.approxCenter.caveat}`}`,
                  ' તૂટક વર્તુળ માત્ર ગામનું અંદાજિત સ્થાન બતાવે છે.'
                )}
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
              <p className="text-zinc-200">{t('Select a survey number', 'સર્વે નંબર પસંદ કરો')}</p>
              <p>
                {t(
                  'Click a survey number in the notices below, or a pin on the map, to see its entries and place it on the map.',
                  'નીચેની નોંધોમાં સર્વે નંબર કે નકશા પરના પિન પર ક્લિક કરો; તેની નોંધો દેખાશે અને નકશા પર મૂકી શકાશે.'
                )}
              </p>
            </div>
          )}
        </Card>
      </div>

      <Card className="p-4 md:p-5">
        <h3 className="text-lg font-semibold text-zinc-100">{t('Notices per month', 'દર મહિને નોંધ')}</h3>
        <p className="mb-4 text-xs text-zinc-500">
          {t('Mutation entries published on e-Chavdi, by type, for the last 24 months.', 'છેલ્લા 24 મહિનામાં ઈ-ચાવડી પર પ્રસિદ્ધ ફેરફાર નોંધ, પ્રકાર પ્રમાણે.')}
        </p>
        <ActivityChart rows={rows} />
      </Card>

      <Card className="p-4 md:p-5">
        <h3 className="text-lg font-semibold text-zinc-100">{t('Sequences worth a closer look', 'ધ્યાનથી જોવા જેવી નોંધની હારમાળા')}</h3>
        <p className="mb-4 text-xs text-zinc-500">
          {t(
            'Patterns in the order of public notices. They describe what the register shows, not why, and are not a judgement on any parcel or person.',
            'જાહેર નોંધોના ક્રમમાં દેખાતી ભાત. રજિસ્ટરમાં શું છે તે બતાવે છે, કેમ થયું તે નહીં; કોઈ જમીન કે વ્યક્તિ વિશે અભિપ્રાય નથી.'
          )}
        </p>
        {patterns.length === 0 ? (
          <p className="text-sm text-zinc-500">{t('None in the imported months.', 'ઉમેરેલા મહિનામાં કંઈ નથી.')}</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {patterns.map((p) => (
              <li key={p.id} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                <p className="text-sm font-medium text-zinc-100">{t(p.title, p.titleGu)}</p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-400">{t(p.detail, p.detailGu)}</p>
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
        <h3 className="mb-4 text-lg font-semibold text-zinc-100">{t('Notices', 'નોંધો')}</h3>
        <EntriesTable entries={data.entries} pins={pins} today={today} selected={selected} onSelect={select} relations={relations} fresh={fresh} />
      </Card>

      <Card className="p-4 md:p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold text-zinc-100">{t('Add months', 'મહિના ઉમેરો')}</h3>
            <p className="text-xs text-zinc-500">
              {t(
                'Imported pages are kept in this browser and merged with the built-in data. To show them on the live site for everyone, download the dataset JSON and publish it (see the README).',
                'ઉમેરેલાં પાનાં આ બ્રાઉઝરમાં રહે છે અને સાઇટની માહિતી સાથે જોડાય છે. બધા માટે લાઇવ સાઇટ પર બતાવવા Dataset JSON ડાઉનલોડ કરીને પ્રકાશિત કરો (README જુઓ).'
              )}
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
                <Eraser className="h-3.5 w-3.5" /> {t('Clear imported', 'ઉમેરેલું કાઢો')}
              </button>
            )}
          </div>
        </div>
        <ImportPanel onImport={onImport} />
      </Card>

      <Card className="p-4 md:p-5">
        <h3 className="text-lg font-semibold text-zinc-100">{t('Move to another device', 'બીજા ફોન / કમ્પ્યુટર પર લઈ જાઓ')}</h3>
        <p className="mt-1 text-sm text-zinc-400">
          {t(
            'Your land, pins, map centre, nearby settings, imported shapes, village map sheets and imported months live only in this browser. Download a backup and restore it on your phone or another computer. Keep the file private: it lists your survey numbers.',
            'તમારી જમીન, પિન, નકશાનું કેન્દ્ર, નજીકના સેટિંગ, ઉમેરેલા આકાર, ગામ નકશાનાં પાનાં અને ઉમેરેલા મહિના ફક્ત આ બ્રાઉઝરમાં છે. બેકઅપ ડાઉનલોડ કરીને ફોન કે બીજા કમ્પ્યુટર પર પાછું લાવો. ફાઇલ ખાનગી રાખો: તેમાં તમારા સર્વે નંબર છે.'
          )}
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
            <Download className="h-3.5 w-3.5" /> {t('Download backup', 'બેકઅપ ડાઉનલોડ કરો')}
          </button>
          <label className={cn(smallBtn, 'cursor-pointer')}>
            <Upload className="h-3.5 w-3.5" /> {t('Restore backup', 'બેકઅપ પાછું લાવો')}
            <input type="file" accept=".json,application/json" className="sr-only" onChange={(e) => restore(e.target.files)} />
          </label>
        </div>
        {backupNotice && <p className="mt-2 text-xs text-rose-400">{backupNotice}</p>}
      </Card>

    </div>
  );
}

'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CATEGORY_META, EntryCategory, PinMap } from '@/lib/land';
import { ControlPoint, XY, solveAffine } from '@/lib/overlay';

export interface MapPin {
  survey: string;
  lat: number;
  lng: number;
  category: EntryCategory;
  label: string;
  /** One of your own survey numbers. */
  mine?: boolean;
}

/** A scanned village map sheet to draw under the pins. */
export interface MapOverlay {
  id: string;
  url: string;
  points: ControlPoint[];
  opacity: number;
}

interface LandMapProps {
  center: { lat: number; lng: number };
  centerLabel: string;
  pins: MapPin[];
  selected: string | null;
  /** Draw a ring of this radius around your own pins; 0 for none. */
  myRadiusKm?: number;
  /** When set, the next map click is reported through onPlace. */
  placing: boolean;
  onPlace: (latlng: { lat: number; lng: number }) => void;
  onSelect: (survey: string) => void;
  /** Aligned scans to draw (three control points each). */
  overlays?: MapOverlay[];
  /** Satellite points picked so far while aligning a scan, drawn as numbered markers. */
  alignPoints?: { lat: number; lng: number }[];
}

const ESRI_ATTR = 'Imagery &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community';

export function LandMap({ center, centerLabel, pins, selected, myRadiusKm = 0, placing, onPlace, onSelect, overlays = [], alignPoints = [] }: LandMapProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const pinLayer = useRef<L.LayerGroup | null>(null);
  const centerLayer = useRef<L.LayerGroup | null>(null);
  const handlers = useRef({ onPlace, onSelect, placing });
  const alignLayer = useRef<L.LayerGroup | null>(null);
  // Scan <img> elements by overlay id, and a function that re-places them for the current zoom.
  const scanEls = useRef(new Map<string, { img: HTMLImageElement; points: ControlPoint[] }>());
  const placeScans = useRef<() => void>(() => {});

  useEffect(() => {
    handlers.current = { onPlace, onSelect, placing };
  }, [onPlace, onSelect, placing]);

  // Create the map once.
  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([center.lat, center.lng], 14);
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: ESRI_ATTR,
    });
    const labels = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, attribution: 'Labels &copy; Esri' }
    );
    const streets = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    });
    satellite.addTo(m);
    labels.addTo(m);
    L.control.layers({ Satellite: satellite, Streets: streets }, { 'Place labels': labels }, { position: 'topright' }).addTo(m);
    L.control.scale({ metric: true, imperial: false }).addTo(m);

    // Scans sit above the imagery and below pins; they never take clicks.
    const scanPane = m.createPane('scans');
    scanPane.style.zIndex = '350';
    scanPane.style.pointerEvents = 'none';
    // Multiply: the scan's white paper turns see-through and only the ink shows over the imagery.
    scanPane.style.mixBlendMode = 'multiply';
    placeScans.current = () => {
      for (const { img, points } of scanEls.current.values()) {
        const src = points.map((p) => p.img) as [XY, XY, XY];
        const dst = points.map((p) => {
          const lp = m.latLngToLayerPoint([p.geo.lat, p.geo.lng]);
          return { x: lp.x, y: lp.y };
        }) as [XY, XY, XY];
        const t = solveAffine(src, dst);
        img.style.display = t ? '' : 'none';
        if (t) img.style.transform = `matrix(${t.join(',')})`;
      }
    };
    m.on('zoomend viewreset', () => placeScans.current());

    centerLayer.current = L.layerGroup().addTo(m);
    alignLayer.current = L.layerGroup().addTo(m);
    pinLayer.current = L.layerGroup().addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => {
      if (handlers.current.placing) handlers.current.onPlace({ lat: e.latlng.lat, lng: e.latlng.lng });
    });
    map.current = m;
    const els = scanEls.current;
    return () => {
      els.clear();
      m.remove();
      map.current = null;
    };
    // The map is created once; later centre changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Approximate village centre.
  useEffect(() => {
    const layer = centerLayer.current;
    if (!layer) return;
    layer.clearLayers();
    L.circle([center.lat, center.lng], {
      radius: 1500,
      color: '#a1a1aa',
      weight: 1,
      dashArray: '4 4',
      fill: false,
      interactive: false,
    }).addTo(layer);
    L.circleMarker([center.lat, center.lng], { radius: 4, color: '#fafafa', weight: 1, fillColor: '#a1a1aa', fillOpacity: 1 })
      .bindTooltip(centerLabel)
      .addTo(layer);
  }, [center.lat, center.lng, centerLabel]);

  // Survey pins.
  useEffect(() => {
    const layer = pinLayer.current;
    if (!layer) return;
    layer.clearLayers();
    for (const p of pins.filter((x) => x.mine && myRadiusKm > 0)) {
      L.circle([p.lat, p.lng], {
        radius: myRadiusKm * 1000,
        color: '#FFD700',
        weight: 1,
        opacity: 0.6,
        dashArray: '6 6',
        fillColor: '#FFD700',
        fillOpacity: 0.04,
        interactive: false,
      }).addTo(layer);
    }
    // Your pins last, so they sit on top.
    for (const p of [...pins].sort((a, b) => Number(!!a.mine) - Number(!!b.mine))) {
      const isSel = p.survey === selected;
      L.circleMarker([p.lat, p.lng], {
        radius: isSel ? 10 : p.mine ? 8 : 7,
        color: isSel ? '#FFD700' : p.mine ? '#fafafa' : '#09090b',
        weight: 2,
        fillColor: p.mine ? '#FFD700' : CATEGORY_META[p.category].color,
        fillOpacity: 1,
      })
        .bindTooltip(`<b>${p.survey}</b>${p.mine ? ' (your land)' : ''}<br/>${p.label}`, { direction: 'top', offset: [0, -6] })
        .on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          handlers.current.onSelect(p.survey);
        })
        .addTo(layer);
    }
  }, [pins, selected, myRadiusKm]);

  // Fly to the selected pin.
  useEffect(() => {
    const p = pins.find((x) => x.survey === selected);
    if (p && map.current) map.current.flyTo([p.lat, p.lng], Math.max(map.current.getZoom(), 16), { duration: 0.6 });
    // Only when the selection changes, not on every pin edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  useEffect(() => {
    if (el.current) el.current.style.cursor = placing ? 'crosshair' : '';
  }, [placing]);

  // Scanned village map sheets.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const pane = m.getPane('scans');
    if (!pane) return;
    const wanted = new Map(overlays.filter((o) => o.points.length === 3).map((o) => [o.id, o]));
    for (const [id, { img }] of scanEls.current) {
      if (!wanted.has(id)) {
        img.remove();
        scanEls.current.delete(id);
      }
    }
    for (const o of wanted.values()) {
      let entry = scanEls.current.get(o.id);
      if (!entry) {
        const img = document.createElement('img');
        img.alt = '';
        img.className = 'leaflet-zoom-hide';
        Object.assign(img.style, { position: 'absolute', left: '0', top: '0', transformOrigin: '0 0', maxWidth: 'none', userSelect: 'none' });
        pane.appendChild(img);
        entry = { img, points: o.points };
        scanEls.current.set(o.id, entry);
      }
      if (entry.img.src !== o.url) entry.img.src = o.url;
      entry.img.style.opacity = String(o.opacity);
      entry.points = o.points;
    }
    placeScans.current();
  }, [overlays]);

  // Numbered markers for satellite points picked while aligning.
  useEffect(() => {
    const layer = alignLayer.current;
    if (!layer) return;
    layer.clearLayers();
    alignPoints.forEach((p, i) => {
      L.marker([p.lat, p.lng], {
        interactive: false,
        icon: L.divIcon({
          className: '',
          html: `<div style="width:22px;height:22px;border-radius:9999px;background:#38bdf8;color:#09090b;font:600 12px/22px system-ui;text-align:center;border:2px solid #09090b">${i + 1}</div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
      }).addTo(layer);
    });
  }, [alignPoints]);

  return <div ref={el} className="h-[420px] w-full overflow-hidden rounded-lg border border-zinc-800 sm:h-[520px]" role="region" aria-label="Map of the village with pinned survey numbers" />;
}

export function pinMapToList(pins: PinMap, describe: (survey: string) => { category: EntryCategory; label: string; mine?: boolean }): MapPin[] {
  return Object.entries(pins).map(([survey, p]) => ({ survey, lat: p.lat, lng: p.lng, ...describe(survey) }));
}


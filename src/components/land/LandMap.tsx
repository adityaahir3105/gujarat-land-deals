'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CATEGORY_META, EntryCategory, PinMap } from '@/lib/land';

export interface MapPin {
  survey: string;
  lat: number;
  lng: number;
  category: EntryCategory;
  label: string;
}

interface LandMapProps {
  center: { lat: number; lng: number };
  centerLabel: string;
  pins: MapPin[];
  selected: string | null;
  /** When set, the next map click is reported through onPlace. */
  placing: boolean;
  onPlace: (latlng: { lat: number; lng: number }) => void;
  onSelect: (survey: string) => void;
}

const ESRI_ATTR = 'Imagery &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community';

export function LandMap({ center, centerLabel, pins, selected, placing, onPlace, onSelect }: LandMapProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const pinLayer = useRef<L.LayerGroup | null>(null);
  const centerLayer = useRef<L.LayerGroup | null>(null);
  const handlers = useRef({ onPlace, onSelect, placing });

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

    centerLayer.current = L.layerGroup().addTo(m);
    pinLayer.current = L.layerGroup().addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => {
      if (handlers.current.placing) handlers.current.onPlace({ lat: e.latlng.lat, lng: e.latlng.lng });
    });
    map.current = m;
    return () => {
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
    for (const p of pins) {
      const isSel = p.survey === selected;
      L.circleMarker([p.lat, p.lng], {
        radius: isSel ? 10 : 7,
        color: isSel ? '#FFD700' : '#09090b',
        weight: 2,
        fillColor: CATEGORY_META[p.category].color,
        fillOpacity: 1,
      })
        .bindTooltip(`<b>${p.survey}</b><br/>${p.label}`, { direction: 'top', offset: [0, -6] })
        .on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          handlers.current.onSelect(p.survey);
        })
        .addTo(layer);
    }
  }, [pins, selected]);

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

  return <div ref={el} className="h-[420px] w-full overflow-hidden rounded-lg border border-zinc-800 sm:h-[520px]" role="region" aria-label="Map of the village with pinned survey numbers" />;
}

export function pinMapToList(pins: PinMap, describe: (survey: string) => { category: EntryCategory; label: string }): MapPin[] {
  return Object.entries(pins).map(([survey, p]) => ({ survey, lat: p.lat, lng: p.lng, ...describe(survey) }));
}


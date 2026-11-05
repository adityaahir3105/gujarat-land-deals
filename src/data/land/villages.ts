// Villages the land dashboard knows about. Names must match the AnyRoR labels exactly
// (Gujarati), because imported e-Chavdi pages are matched on them.
//
// To add a village: add an entry here, collect its pages (scripts/collect_echavdi.py) and
// run `npm run data:build`.

export interface VillageConfig {
  district: string;
  taluka: string;
  village: string;
  /** English names for headings. */
  en: { district: string; taluka: string; village: string };
  /** AnyRoR village code shown in the village drop-down, e.g. "047". */
  anyrorCode: string;
  /** Rough village location for the map's starting view. Not a parcel location. */
  approxCenter: { lat: number; lng: number; source: string; sourceUrl: string; caveat: string };
}

export const VILLAGES: VillageConfig[] = [
  {
    district: 'કચ્છ',
    taluka: 'ભચાઉ',
    village: 'ચીરઈ મોટી',
    en: { district: 'Kachchh', taluka: 'Bhachau', village: 'Chirai Moti' },
    anyrorCode: '047',
    approxCenter: {
      lat: 23.218,
      lng: 70.257,
      source: 'GeoNames 1274108 ("Chirai Mota"), via Who\'s On First',
      sourceUrl: 'https://spelunker.whosonfirst.org/id/1225928019/',
      caveat:
        'Point for the settlement, about 12 km from Bhachau town. Another gazetteer gives 23.298, 70.343 for "Chirai". Neither is checked against the official village map; move it with "Set village centre" if it is off.',
    },
  },
];

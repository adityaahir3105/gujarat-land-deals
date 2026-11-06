import boundariesJson from './boundaries.json';
import echavdi from './echavdi.json';
import watchJson from './watch.json';
import { VILLAGES, VillageConfig } from './villages';
import { LandDataset, villageId } from '@/lib/land';
import type { WatchFeed } from '@/lib/watch';
import type { BoundaryCollection, BoundaryFile } from '@/lib/geo';

const datasets = echavdi as LandDataset[];

/** The village shown by the app (the first configured one, for now) and its built-in notices. */
export function defaultVillage(): { village: VillageConfig; seed: LandDataset } {
  const village = VILLAGES[0];
  const seed = datasets.find((d) => villageId(d) === villageId(village)) ?? {
    district: village.district,
    taluka: village.taluka,
    village: village.village,
    months: [],
    entries: [],
  };
  return { village, seed };
}

/** Public area-watch feed (src/data/land/watch.json). */
export const watchFeed = watchJson as WatchFeed;

/** Public village outlines (src/data/land/boundaries.json, from `npm run boundaries:build`). */
export const boundaries = boundariesJson as BoundaryFile;

export function boundaryFor(village: VillageConfig): BoundaryCollection | undefined {
  return boundaries.villages[villageId(village)];
}

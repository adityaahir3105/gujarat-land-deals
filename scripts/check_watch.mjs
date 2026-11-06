#!/usr/bin/env node
// Validate src/data/land/watch.json (run in CI and by the weekly watch task before it opens a PR).
// Uses the app's own validator in src/lib/watch.ts, compiled in memory like build_dataset.mjs.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compile = (rel) =>
  ts.transpileModule(readFileSync(join(root, rel), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;

// watch.ts imports './land'; inline land.ts as a data: URL module and point the import at it.
const landUrl = `data:text/javascript;base64,${Buffer.from(compile('src/lib/land.ts')).toString('base64')}`;
const watchJs = compile('src/lib/watch.ts').replace(/from ['"]\.\/land['"]/, `from '${landUrl}'`);
const { validateWatchFeed } = await import(`data:text/javascript;base64,${Buffer.from(watchJs).toString('base64')}`);

const file = join(root, 'src/data/land/watch.json');
let feed;
try {
  feed = JSON.parse(readFileSync(file, 'utf8'));
} catch (e) {
  console.error(`watch.json is not valid JSON: ${e.message}`);
  process.exit(1);
}
const errs = validateWatchFeed(feed);
if (errs.length) {
  console.error(`watch.json has ${errs.length} problem(s):\n- ${errs.join('\n- ')}`);
  process.exit(1);
}
console.log(`watch.json OK: ${feed.items.length} item(s), updated ${feed.updated}`);

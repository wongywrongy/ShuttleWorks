/**
 * Aggregate interaction-sweep results into a triage table (Stage 1.4 input).
 * Reads results/*.json, prints per-outcome groups with dedup by (name+sel),
 * filtering benign noise (expected no-ops, poll 4xx unrelated to the press).
 *
 * Usage: node analyze.mjs [resultsDir]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), process.argv[2] ?? 'results');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));

const presses = [];
const passResults = { doublefire: [], netfail: [], earlyclick: [] };
for (const f of files) {
  const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  if (f.startsWith('default-')) {
    for (const r of data.results) presses.push(r);
    if (data.entryHarness?.length) {
      presses.push({ view: data.view, name: '(route entry)', sel: '-', outcome: 'entry-harness', harness: data.entryHarness });
    }
  } else if (f.startsWith('doublefire')) passResults.doublefire = data;
  else if (f.startsWith('netfail')) passResults.netfail = data;
  else if (f.startsWith('earlyclick')) passResults.earlyclick = data;
}

const fmt = (r) =>
  `${(r.view ?? '?').padEnd(24)} ${(r.name || '(unnamed)').slice(0, 45).padEnd(47)} ${(r.context ?? '').padEnd(8)} ${r.sel?.slice(0, 60) ?? ''}`;

const groups = {};
for (const r of presses) (groups[r.outcome] ??= []).push(r);

const ORDER = [
  'error', 'unhandledrejection', 'native-dialog', 'http-5xx', 'console.error', 'http-4xx',
  'entry-harness', 'NO-OP', 'unclickable', 'skipped-destructive', 'skipped-bulk', 'skipped-external',
];
console.log(`total presses: ${presses.length}\n`);
for (const key of ORDER) {
  const rows = groups[key];
  if (!rows?.length) continue;
  console.log(`\n===== ${key} (${rows.length}) =====`);
  for (const r of rows) {
    console.log(fmt(r));
    const detail =
      r.errors?.[0] ??
      r.harness?.find((h) => h.kind !== 'console.error')?.message ??
      r.harness?.[0]?.message ??
      r.consoleErrors?.[0] ??
      (r.badResponses?.length ? r.badResponses.map((b) => `${b.method} ${b.url} → ${b.status}`).join(' ; ') : '') ??
      '';
    if (detail) console.log(`    ↳ ${String(detail).slice(0, 220).replace(/\n/g, ' | ')}`);
    if (r.nativeDialogs?.length) console.log(`    ↳ native ${r.nativeDialogs[0].type}: ${r.nativeDialogs[0].message}`);
  }
}
const quiet = ['navigated', 'acted', 'opened-dialog', 'disabled-native'];
console.log(`\n===== quiet outcomes =====`);
for (const key of quiet) console.log(`${key}: ${groups[key]?.length ?? 0}`);

for (const [pass, rows] of Object.entries(passResults)) {
  if (!rows.length) continue;
  console.log(`\n\n########## pass: ${pass} (${rows.length}) ##########`);
  for (const r of rows) {
    const flag =
      r.outcome && !['acted', 'navigated', 'opened-dialog', 'NO-OP'].includes(r.outcome) ? ` [${r.outcome}]` : '';
    const nf = pass === 'netfail' ? ` stuck=${r.stuckPending ?? '?'} surfaced=${r.errorSurfaced ?? '?'}` : '';
    const df = pass === 'doublefire' ? ` mutations×${r.mutatingCount}` : '';
    console.log(`${(r.view ?? '?').padEnd(24)} ${(r.name || '(unnamed)').slice(0, 40).padEnd(42)}${flag}${df}${nf}`);
    if (r.errors?.length) console.log(`    ↳ ${r.errors[0].slice(0, 200)}`);
    if (r.harness?.length) console.log(`    ↳ ${r.harness[0].kind}: ${r.harness[0].message.slice(0, 200)}`);
    if (pass === 'doublefire' && r.mutating?.length > 1) {
      console.log(`    ↳ ${r.mutating.map((m) => `${m.method} ${m.url}`).join(' ; ').slice(0, 220)}`);
    }
  }
}

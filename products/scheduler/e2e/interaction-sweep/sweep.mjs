/**
 * Interaction-audit sweep (Stage 1.3) — press every interactive element in
 * every reachable view against a PRODUCTION build (vite preview :4173 →
 * backend :8600) with the VITE_ERROR_HARNESS=1 instrumentation baked in.
 *
 * Passes:
 *   default    press every enumerated element once per view; record outcome
 *   doublefire re-press elements that mutated on first press, twice rapidly
 *   netfail    re-press mutating elements with /api mutations aborted
 *   earlyclick press primary buttons immediately after route entry
 *
 * Outcomes recorded per press: pageerror / unhandledrejection / boundary /
 * console.error / http-4xx / http-5xx / dialog(window.confirm!) / navigated /
 * opened-dialog / acted (DOM mutated or network fired) / NO-OP (nothing
 * observable) / unclickable / disabled-native / skipped-destructive.
 *
 * Usage: node sweep.mjs [--pass default|doublefire|netfail|earlyclick|all]
 *                       [--views <substr,substr>] [--out results]
 * Report JSON is written incrementally per view to interaction-sweep/results/.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- config
const BASE = process.env.SWEEP_BASE ?? 'http://localhost:4173';
const API = process.env.SWEEP_API ?? 'http://localhost:8600';

const TIDS = {
  midday: '07a3776a-1cf8-41b4-b8bd-77a8abc445f7', // Sim Mid-Day Meet (seed 99) — live states
  fullmeet: '94ce713e-75ce-47d1-adf7-5e5bbac3aecb', // Sim Full Meet (seed 11)
  bracket: '670320bb-155b-4d1f-b23c-28b255ea2100', // Sim Bracket de (seed 12)
  mixed: '2d1aa2da-91c5-4166-91dc-d4d1f8f1aabf', // Sim Mixed Workspace (seed 13)
};

const MEET_SEGMENTS = ['overview', 'roster', 'matches', 'setup', 'tv', 'display-config', 'schedule', 'live'];
const BRACKET_SEGMENTS = ['overview', 'bracket-roster', 'bracket-draws', 'bracket-matches', 'bracket-setup', 'bracket-schedule', 'bracket-live'];
const ADMIN_SEGMENTS = ['ws-venue', 'ws-members', 'ws-sharing', 'ws-modules', 'ws-sync', 'ws-settings'];

/** Views in press order: module surfaces first, admin last (module toggles /
 *  danger zone can reshape the workspace), hub-level last of all. */
function buildViews(emptyTid) {
  const v = [];
  for (const seg of MEET_SEGMENTS) v.push({ id: `midday:${seg}`, url: `/tournaments/${TIDS.midday}/${seg}` });
  for (const seg of BRACKET_SEGMENTS) v.push({ id: `bracket:${seg}`, url: `/tournaments/${TIDS.bracket}/${seg}` });
  // Mixed workspace: the union nav (meet+bracket+display all enabled).
  for (const seg of ['overview', 'schedule', 'live', 'bracket-draws', 'bracket-live']) {
    v.push({ id: `mixed:${seg}`, url: `/tournaments/${TIDS.mixed}/${seg}` });
  }
  // Empty-data workspace (created at sweep start): every segment, incl. admin
  // and the danger zone — this workspace is disposable.
  if (emptyTid) {
    for (const seg of [...MEET_SEGMENTS, ...ADMIN_SEGMENTS]) {
      v.push({ id: `empty:${seg}`, url: `/tournaments/${emptyTid}/${seg}`, disposable: true });
    }
  }
  // Admin segments on a populated workspace (members/sharing/venue have data).
  for (const seg of ADMIN_SEGMENTS) v.push({ id: `fullmeet:${seg}`, url: `/tournaments/${TIDS.fullmeet}/${seg}` });
  // Shell-level.
  v.push({ id: 'hub:home', url: '/' });
  v.push({ id: 'hub:new', url: '/new' });
  v.push({ id: 'hub:settings', url: '/settings' });
  v.push({ id: `display:public`, url: `/display?id=${TIDS.midday}` });
  return v;
}

const INTERACTIVE_SELECTOR = [
  'button',
  '[role="button"]',
  '[role="menuitem"]',
  '[role="menuitemradio"]',
  '[role="tab"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="option"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
  'select',
  'summary',
  'a[href]',
].join(', ');

/** Cap on same-role bulk collections (listbox options, long pickers): press a
 *  representative few, record the rest as skipped-bulk. */
const BULK_ROLES = new Set(['option']);
const BULK_CAP = 5;

/** Never press these even on populated fixtures (catastrophic, irreversible
 *  for the rest of the sweep). Pressed only on the disposable empty
 *  workspace. Matched against accessible name, case-insensitive. */
const DESTRUCTIVE_SKIP = [/delete\s+workspace/i, /sign\s?out/i, /log\s?out/i];
/** External navigation — never press. */
const EXTERNAL_LINK = (el) => el.href && /^https?:\/\//.test(el.href) && !el.href.startsWith(BASE);

// ---------------------------------------------------------------- helpers
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function drainHarness(page) {
  return page.evaluate(() => {
    const h = window.__swErrorHarness;
    if (!h) return [];
    return h.events.splice(0, h.events.length);
  }).catch(() => []);
}

async function armMutationCounter(page) {
  await page.evaluate(() => {
    if (window.__mutObs) window.__mutObs.disconnect();
    window.__mutCount = 0;
    window.__mutObs = new MutationObserver((m) => { window.__mutCount += m.length; });
    window.__mutObs.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  }).catch(() => {});
}
const readMutations = (page) => page.evaluate(() => { const n = window.__mutCount ?? 0; window.__mutCount = 0; return n; }).catch(() => 0);

/** Enumerate visible interactive elements with a stable-ish descriptor. */
async function enumerate(page) {
  return page.evaluate((SEL) => {
    const accessibleName = (el) => {
      const aria = el.getAttribute('aria-label');
      if (aria) return aria;
      const lb = el.getAttribute('aria-labelledby');
      if (lb) { const ref = document.getElementById(lb); if (ref?.textContent?.trim()) return ref.textContent.trim(); }
      const text = el.innerText?.trim().replace(/\s+/g, ' ');
      if (text) return text.slice(0, 60);
      return el.getAttribute('title') ?? '';
    };
    const shortSel = (el) => {
      const parts = [];
      let cur = el;
      for (let d = 0; cur && d < 5; d++) {
        let part = cur.tagName.toLowerCase();
        if (cur.id) { parts.unshift(`${part}#${CSS.escape(cur.id)}`); return parts.join(' > '); }
        const tid = cur.getAttribute('data-testid');
        if (tid) { parts.unshift(`${part}[data-testid="${tid}"]`); return parts.join(' > '); }
        const parent = cur.parentElement;
        if (parent) {
          const sibs = Array.from(parent.children).filter((c) => c.tagName === cur.tagName);
          if (sibs.length > 1) part += `:nth-of-type(${sibs.indexOf(cur) + 1})`;
        }
        parts.unshift(part);
        cur = parent;
      }
      return parts.join(' > ');
    };
    const els = Array.from(document.querySelectorAll(SEL));
    // Heuristic pass: React attaches handlers invisibly, so clickable
    // rows/chips (div/li/tr with onClick but no role) match no selector.
    // cursor:pointer outside a real interactive element is the tell.
    const pointerEls = Array.from(document.querySelectorAll('div, li, tr, span'))
      .filter((el) => {
        if (el.closest(SEL)) return false;
        if (el.querySelector(SEL)) {
          // Containers embedding buttons (rows with action clusters) are still
          // clickable surfaces themselves — keep rows (li/tr/[data-testid]),
          // drop generic wrapper divs to avoid pressing layout containers.
          if (el.tagName === 'DIV' && !el.getAttribute('data-testid')) return false;
        }
        return getComputedStyle(el).cursor === 'pointer';
      })
      .slice(0, 25);
    return els.concat(pointerEls)
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        const st = getComputedStyle(el);
        return st.visibility !== 'hidden' && st.display !== 'none';
      })
      .map((el, i) => ({
        i,
        sel: shortSel(el),
        name: accessibleName(el),
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role') ?? '',
        disabled: el.disabled === true,
        ariaDisabled: el.getAttribute('aria-disabled') === 'true',
        href: el.tagName === 'A' ? el.href : '',
        inDialog: !!el.closest('[role="dialog"], [role="alertdialog"]'),
        testid: el.getAttribute('data-testid') ?? '',
        heuristic: !el.matches(SEL),
      }));
  }, INTERACTIVE_SELECTOR);
}

async function dialogCount(page) {
  return page.evaluate(() => document.querySelectorAll('[role="dialog"], [role="alertdialog"]').length).catch(() => 0);
}

/** Close any open dialog/menu and return to the view URL. */
async function recover(page, viewUrl) {
  for (let i = 0; i < 2; i++) {
    if ((await dialogCount(page)) === 0) break;
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(200);
  }
  if ((await dialogCount(page)) > 0) {
    // Dialog that Escape doesn't close — try a Close/Cancel button, else reload.
    const closer = page.locator('[role="dialog"] button, [role="alertdialog"] button')
      .filter({ hasText: /^(close|cancel|done|×)$/i }).first();
    if (await closer.count().catch(() => 0)) await closer.click({ timeout: 1500 }).catch(() => {});
    await sleep(200);
  }
  const here = new URL(page.url());
  const want = new URL(BASE + viewUrl);
  if (here.pathname + here.search !== want.pathname + want.search || (await dialogCount(page)) > 0) {
    await page.goto(BASE + viewUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await sleep(900);
  }
  await armMutationCounter(page);
  await drainHarness(page);
}

function newPressMonitors(page, state) {
  state.pageErrors = [];
  state.consoleErrors = [];
  state.responses = [];
  state.requestsFailed = [];
  state.mutatingRequests = [];
  state.nativeDialogs = [];
}

function classify(sig) {
  if (sig.nativeDialogs.length) return 'native-dialog';
  if (sig.pageErrors.length || sig.harness.some((e) => e.kind === 'error' || e.kind === 'boundary')) return 'error';
  if (sig.harness.some((e) => e.kind === 'unhandledrejection')) return 'unhandledrejection';
  if (sig.responses.some((r) => r.status >= 500)) return 'http-5xx';
  if (sig.consoleErrors.length || sig.harness.some((e) => e.kind === 'console.error')) return 'console.error';
  if (sig.responses.some((r) => r.status >= 400)) return 'http-4xx';
  if (sig.navigated) return 'navigated';
  if (sig.dialogOpened) return 'opened-dialog';
  if (sig.mutations > 2 || sig.requests > 0) return 'acted';
  return 'NO-OP';
}

// ---------------------------------------------------------------- passes
async function pressElement(page, target, state, { clicks = 1, gap = 60 } = {}) {
  newPressMonitors(page, state);
  await drainHarness(page);
  await readMutations(page);
  const urlBefore = page.url();
  const dialogsBefore = await dialogCount(page);
  const reqBefore = state.requestCounter.n;

  const loc = page.locator(target.sel).first();
  let clickError = null;
  for (let c = 0; c < clicks; c++) {
    try {
      await loc.click({ timeout: 2500, force: target.ariaDisabled });
    } catch (e) {
      clickError = String(e?.message ?? e).split('\n')[0];
      break;
    }
    if (clicks > 1 && c < clicks - 1) await sleep(gap);
  }
  await sleep(750);

  const harness = await drainHarness(page);
  const mutations = await readMutations(page);
  const sig = {
    pageErrors: state.pageErrors.slice(),
    consoleErrors: state.consoleErrors.slice(),
    responses: state.responses.slice(),
    requestsFailed: state.requestsFailed.slice(),
    mutating: state.mutatingRequests.slice(),
    nativeDialogs: state.nativeDialogs.slice(),
    harness,
    mutations,
    requests: state.requestCounter.n - reqBefore,
    navigated: page.url() !== urlBefore,
    dialogOpened: (await dialogCount(page)) > dialogsBefore,
  };
  return { sig, clickError };
}

/** Press every not-yet-seen element inside the open dialog: non-dismissing
 *  buttons first, dismissers (Cancel/Close/×/Done) last — so the dialog stays
 *  open long enough to sweep its contents. */
async function sweepDialog(page, view, state, seen, record, baseUrl) {
  const DISMISS = /^(cancel|close|done|×|x)$/i;
  const deferred = [];
  for (let i = 0; i < 30; i++) {
    if ((await dialogCount(page)) === 0) break;
    const elements = await enumerate(page);
    const target = elements.find(
      (e) => e.inDialog && !seen.has(`${e.sel}||${e.name}`) && !DISMISS.test(e.name.trim()),
    );
    if (!target) {
      const dis = elements.find((e) => e.inDialog && !seen.has(`${e.sel}||${e.name}`));
      if (dis) deferred.push(dis);
      break;
    }
    seen.add(`${target.sel}||${target.name}`);
    if (!view.disposable && DESTRUCTIVE_SKIP.some((re) => re.test(target.name))) {
      record(target, { outcome: 'skipped-destructive', context: 'dialog' });
      continue;
    }
    if (target.disabled) { record(target, { outcome: 'disabled-native', context: 'dialog' }); continue; }
    const { sig, clickError } = await pressElement(page, target, state);
    record(target, {
      outcome: clickError ? 'unclickable' : classify(sig),
      context: 'dialog',
      clickError,
      mutations: sig.mutations,
      requests: sig.requests,
      mutating: sig.mutating,
      errors: sig.pageErrors,
      consoleErrors: sig.consoleErrors.slice(0, 3),
      harness: sig.harness.slice(0, 5),
      badResponses: sig.responses.filter((r) => r.status >= 400),
      nativeDialogs: sig.nativeDialogs,
    });
    // A dialog press can navigate or close the dialog (e.g. Commit) — if the
    // dialog is gone, stop; the outer loop recovers.
  }
  for (const dis of deferred) {
    if ((await dialogCount(page)) === 0) break;
    seen.add(`${dis.sel}||${dis.name}`);
    const { sig, clickError } = await pressElement(page, dis, state);
    record(dis, { outcome: clickError ? 'unclickable' : classify(sig), context: 'dialog-dismiss', clickError, harness: sig.harness.slice(0, 5), errors: sig.pageErrors });
  }
  await recover(page, baseUrl);
}

async function sweepView(page, view, state, opts) {
  const t0 = Date.now();
  await page.goto(BASE + view.url, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await sleep(1400);
  await armMutationCounter(page);

  // Route-entry errors (before any press).
  const entryHarness = await drainHarness(page);
  const results = [];
  const seen = new Set();
  const record = (target, r) => results.push({ view: view.id, ...target, ...r });

  // Sub-states: same-pathname URLs discovered by presses (e.g. ?section=…,
  // ?view=… tabs) whose content must also be swept.
  const stateQueue = [view.url];
  const queuedStates = new Set([view.url]);
  const bulkCount = new Map();

  while (stateQueue.length) {
    const stateUrl = stateQueue.shift();
    if (stateUrl !== view.url) {
      await page.goto(BASE + stateUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await sleep(1000);
      await armMutationCounter(page);
      await drainHarness(page);
    }

    for (let idx = 0; idx < 400; idx++) {
      // Re-enumerate each iteration: presses mutate the DOM. Press the first
      // not-yet-seen element (keyed by sel+name).
      const elements = await enumerate(page);
      const target = elements.find((e) => !seen.has(`${e.sel}||${e.name}`));
      if (!target) break;
      const key = `${target.sel}||${target.name}`;
      seen.add(key);

      if (EXTERNAL_LINK(target)) { record(target, { outcome: 'skipped-external' }); continue; }
      if (!view.disposable && DESTRUCTIVE_SKIP.some((re) => re.test(target.name))) {
        record(target, { outcome: 'skipped-destructive' });
        continue;
      }
      if (target.disabled) {
        // Native disabled: the browser suppresses activation by construction.
        record(target, { outcome: 'disabled-native' });
        continue;
      }
      if (BULK_ROLES.has(target.role)) {
        const n = (bulkCount.get(target.role) ?? 0) + 1;
        bulkCount.set(target.role, n);
        if (n > BULK_CAP) { record(target, { outcome: 'skipped-bulk' }); continue; }
      }

      const { sig, clickError } = await pressElement(page, target, state);
      const outcome = clickError ? 'unclickable' : classify(sig);
      record(target, {
        outcome,
        clickError,
        mutations: sig.mutations,
        requests: sig.requests,
        mutating: sig.mutating,
        errors: sig.pageErrors,
        consoleErrors: sig.consoleErrors.slice(0, 3),
        harness: sig.harness.slice(0, 5),
        badResponses: sig.responses.filter((r) => r.status >= 400),
        nativeDialogs: sig.nativeDialogs,
        navigatedTo: sig.navigated ? page.url() : undefined,
      });

      // Same-pathname search change = a sub-state (settings section, display
      // tab): queue it for its own sweep pass.
      if (sig.navigated) {
        const here = new URL(page.url());
        const base = new URL(BASE + view.url);
        const sub = here.pathname + here.search;
        if (here.pathname === base.pathname && !queuedStates.has(sub) && queuedStates.size < 14) {
          queuedStates.add(sub);
          stateQueue.push(sub);
        }
      }

      if (sig.dialogOpened) {
        await sweepDialog(page, view, state, seen, record, stateUrl);
      } else {
        await recover(page, stateUrl);
      }
    }
  }

  return { view: view.id, url: view.url, entryHarness, pressed: results.length, results, ms: Date.now() - t0 };
}

/** doublefire / netfail passes operate on the mutating elements found in the
 *  default pass results. */
async function rePressPass(page, state, defaultResults, mode) {
  const out = [];
  const targets = [];
  for (const viewRes of defaultResults) {
    for (const r of viewRes.results) {
      if ((r.mutating?.length ?? 0) > 0 && !r.inDialog) {
        targets.push({ view: viewRes.view, url: viewRes.url, sel: r.sel, name: r.name, ariaDisabled: false });
      }
    }
  }
  console.log(`[${mode}] ${targets.length} mutating elements to re-press`);

  let unroute = null;
  if (mode === 'netfail') {
    await page.route('**/*', (route) => {
      const req = route.request();
      const isApi = req.url().includes(':8600') || new URL(req.url()).pathname.startsWith('/api');
      if (isApi && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method())) return route.abort('failed');
      return route.continue();
    });
    unroute = () => page.unroute('**/*');
  }

  let currentUrl = null;
  for (const t of targets) {
    if (currentUrl !== t.url) {
      await page.goto(BASE + t.url, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await sleep(1400);
      await armMutationCounter(page);
      currentUrl = t.url;
    }
    const { sig, clickError } = await pressElement(page, t, state, mode === 'doublefire' ? { clicks: 2, gap: 50 } : {});
    let extra = {};
    if (mode === 'netfail' && !clickError) {
      // Stuck-pending probe: is the element still disabled 5s after failure?
      await sleep(4500);
      const still = await page.locator(t.sel).first().isDisabled().catch(() => false);
      const errorSurfaced = await page.evaluate(() =>
        !!document.querySelector('[role="alert"], [data-testid*="toast"], [class*="toast"]')
      ).catch(() => false);
      extra = { stuckPending: still, errorSurfaced };
    }
    out.push({
      pass: mode, view: t.view, sel: t.sel, name: t.name,
      outcome: clickError ? 'unclickable' : classify(sig),
      clickError,
      mutatingCount: sig.mutating.length,
      mutating: sig.mutating,
      errors: sig.pageErrors, harness: sig.harness.slice(0, 5),
      consoleErrors: sig.consoleErrors.slice(0, 3),
      badResponses: sig.responses.filter((r) => r.status >= 400),
      requestsFailed: sig.requestsFailed,
      ...extra,
    });
    await recover(page, t.url);
  }
  if (unroute) await unroute();
  return out;
}

/** earlyclick: navigate and click primary buttons before data has loaded. */
async function earlyClickPass(page, state, views) {
  const out = [];
  for (const view of views) {
    if (view.disposable) continue;
    for (let n = 0; n < 4; n++) {
      newPressMonitors(page, state);
      await page.goto(BASE + view.url, { waitUntil: 'commit' }).catch(() => {});
      // No settle: click the nth visible button ASAP.
      try {
        await page.locator('button:visible').nth(n).click({ timeout: 1200 });
      } catch { continue; }
      await sleep(600);
      const harness = await drainHarness(page);
      const bad = state.pageErrors.length || harness.some((e) => e.kind !== 'console.error') ||
        state.consoleErrors.length || harness.length;
      if (bad) {
        out.push({
          pass: 'earlyclick', view: view.id, nth: n,
          errors: state.pageErrors, harness: harness.slice(0, 5), consoleErrors: state.consoleErrors.slice(0, 3),
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- main
async function createEmptyWorkspace() {
  try {
    const res = await fetch(`${API}/tournaments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Interaction Sweep — empty',
        kind: 'meet',
        modules: [
          { moduleId: 'meet', status: 'enabled' },
          { moduleId: 'display', status: 'enabled' },
          { moduleId: 'bracket', status: 'available' },
        ],
      }),
    });
    if (!res.ok) { console.warn('empty workspace create failed:', res.status, await res.text()); return null; }
    const body = await res.json();
    return body.id ?? body.tournamentId ?? null;
  } catch (e) {
    console.warn('empty workspace create failed:', e.message);
    return null;
  }
}

const args = process.argv.slice(2);
const getArg = (k, dflt) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const PASS = getArg('pass', 'all');
const VIEW_FILTER = getArg('views', '')?.split(',').filter(Boolean) ?? [];
const OUT_DIR = path.resolve(__dirname, getArg('out', 'results'));
fs.mkdirSync(OUT_DIR, { recursive: true });

const emptyTid = await createEmptyWorkspace();
console.log('empty workspace tid:', emptyTid);
let views = buildViews(emptyTid);
if (VIEW_FILTER.length) views = views.filter((v) => VIEW_FILTER.some((f) => v.id.includes(f)));

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();

const state = { requestCounter: { n: 0 } };
newPressMonitors(page, state);
page.on('pageerror', (e) => state.pageErrors.push(String(e?.message ?? e)));
page.on('console', (m) => { if (m.type() === 'error') state.consoleErrors.push(m.text().slice(0, 500)); });
page.on('request', (r) => {
  state.requestCounter.n++;
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method())) {
    state.mutatingRequests.push({ method: r.method(), url: r.url().replace(BASE, '').slice(0, 120) });
  }
});
page.on('response', (r) => {
  if (r.status() >= 400) state.responses.push({ status: r.status(), url: r.url().replace(BASE, '').slice(0, 120), method: r.request().method() });
});
page.on('requestfailed', (r) => state.requestsFailed.push({ url: r.url().replace(BASE, '').slice(0, 120), err: r.failure()?.errorText }));
page.on('dialog', async (d) => {
  state.nativeDialogs.push({ type: d.type(), message: d.message().slice(0, 200) });
  await d.dismiss().catch(() => {});
});

const defaultResults = [];
if (PASS === 'all' || PASS === 'default') {
  for (const view of views) {
    console.log(`[default] ${view.id} …`);
    const res = await sweepView(page, view, state, {});
    defaultResults.push(res);
    fs.writeFileSync(path.join(OUT_DIR, `default-${view.id.replace(/[:/]/g, '_')}.json`), JSON.stringify(res, null, 1));
    console.log(`[default] ${view.id}: ${res.pressed} pressed in ${Math.round(res.ms / 1000)}s`);
  }
}

if (PASS === 'all' || PASS === 'doublefire' || PASS === 'netfail') {
  let base = defaultResults;
  if (!base.length) {
    base = fs.readdirSync(OUT_DIR).filter((f) => f.startsWith('default-')).map((f) => JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), 'utf8')));
  }
  if (PASS === 'all' || PASS === 'doublefire') {
    const dbl = await rePressPass(page, state, base, 'doublefire');
    fs.writeFileSync(path.join(OUT_DIR, 'doublefire.json'), JSON.stringify(dbl, null, 1));
  }
  if (PASS === 'all' || PASS === 'netfail') {
    const nf = await rePressPass(page, state, base, 'netfail');
    fs.writeFileSync(path.join(OUT_DIR, 'netfail.json'), JSON.stringify(nf, null, 1));
  }
}

if (PASS === 'all' || PASS === 'earlyclick') {
  const early = await earlyClickPass(page, state, views);
  fs.writeFileSync(path.join(OUT_DIR, 'earlyclick.json'), JSON.stringify(early, null, 1));
}

await browser.close();
console.log('SWEEP_COMPLETE');

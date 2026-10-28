// Tests the parser and the service worker logic against real Cricinfo page data: node dev/test.js
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const EXT = path.join(__dirname, '..', 'cricket-float');
const P = require(path.join(EXT, 'parser.js'));
const live = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'ban-wi-live.json'), 'utf8'));
const others = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'other-states.json'), 'utf8'));
const USER_URL = 'https://www.cricinfo.com/series/west-indies-in-bangladesh-2026-27-1553291/bangladesh-vs-west-indies-1st-test-1553295/live-cricket-score';

let failed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// --- parser ------------------------------------------------------------------

test('matchUrl normalises any match link', () => {
  assert.equal(P.matchUrl(USER_URL), USER_URL);
  assert.equal(P.matchUrl('https://www.espncricinfo.com/series/west-indies-in-bangladesh-2026-27-1553291/bangladesh-vs-west-indies-1st-test-1553295/full-scorecard'), USER_URL);
  assert.equal(P.matchUrl('cricinfo.com/series/West-Indies-in-Bangladesh-2026-27-1553291/bangladesh-vs-west-indies-1st-test-1553295'), USER_URL);
  assert.equal(P.matchUrl('https://www.cricinfo.com/live-cricket-score'), null);
  assert.equal(P.matchUrl('hello'), null);
});

test('extractNextData finds the JSON in page HTML', () => {
  const html = `<html><head><title>x</title></head><body><div id="__next"></div><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(live)}</script><script>1</script></body></html>`;
  assert.deepEqual(P.extractNextData(html), live);
  assert.equal(P.extractNextData('<html>blocked</html>'), null);
});

test('parseMatch: live Test', () => {
  const s = P.parseMatch(live);
  assert.equal(s.phase, 'live');
  assert.equal(s.status, 'Live');
  assert.equal(s.statusText, 'Day 1 - Session 1: Bangladesh chose to bat.');
  assert.equal(s.title, '1st Test');
  assert.equal(s.day, 1);
  assert.equal(s.ground, 'Mirpur');
  assert.deepEqual(s.teams.map((t) => [t.abbr, t.score, t.info, t.batting]), [['BAN', '10/1', '7 ov', true], ['WI', '', '', false]]);
  assert.deepEqual(s.batters.map((b) => [b.name, b.runs, b.balls, b.striker]), [['Mominul Haque', 1, 2, true], ['Shadman Islam', 1, 17, false]]);
  assert.deepEqual(s.bowler, { name: 'Jayden Seales', overs: 4, maidens: 2, runs: 5, wickets: 1 });
  assert.equal(s.recent.map((b) => b.t).join(' '), '• • • • • W • 1');
  assert.deepEqual(s.recent.map((b) => b.o), [6, 6, 7, 7, 7, 7, 7, 7]);
  assert.equal(s.crr, 1.42);
  assert.equal(s.rrr, null);
});

test('parseMatch: upcoming match with template status', () => {
  const s = P.parseMatch(others.pre);
  assert.equal(s.phase, 'pre');
  assert.equal(s.status, '');
  assert.equal(s.statusText, '');
  assert.equal(s.startTime, '2026-10-28T08:30:00.000Z');
  assert.deepEqual(s.teams.map((t) => t.abbr), ['IND-W', 'ZIM-W']);
  assert.deepEqual(s.batters, []);
  assert.equal(s.bowler, null);
  assert.deepEqual(s.recent, []);
});

test('parseMatch: stumps, all out, striker unknown after wicket', () => {
  const s = P.parseMatch(others.saaus);
  assert.equal(s.status, 'Stumps');
  assert.equal(s.teams[0].score, '329');
  assert.equal(s.batters[0].striker, false);
  assert.equal(s.bowler.name, 'Mitchell Starc');
  assert.deepEqual(s.recent.map((b) => b.k), ['W', '0', 'W']);
});

test('parseMatch: extras and boundaries get the right labels', () => {
  const nd = JSON.parse(JSON.stringify(live));
  const balls = nd.props.appPageProps.data.data.content.supportInfo.liveSummary.recentBalls;
  const base = { inningNumber: 1, overNumber: 8, isFour: false, isSix: false, isWicket: false, wides: 0, noballs: 0, byes: 0, legbyes: 0, batsmanRuns: 0 };
  balls.unshift(
    { ...base, id: 9, ballNumber: 5, totalRuns: 1, legbyes: 1 },
    { ...base, id: 8, ballNumber: 4, totalRuns: 2, byes: 2 },
    { ...base, id: 7, ballNumber: 4, totalRuns: 5, noballs: 1, batsmanRuns: 4, isFour: true },
    { ...base, id: 6, ballNumber: 3, totalRuns: 1, wides: 1 },
    { ...base, id: 5, ballNumber: 3, totalRuns: 6, isSix: true, batsmanRuns: 6 },
    { ...base, id: 4, ballNumber: 2, totalRuns: 4, isFour: true, batsmanRuns: 4 },
  );
  const s = P.parseMatch(nd);
  assert.deepEqual(s.recent.slice(-6).map((b) => `${b.t}:${b.k}`), ['4:4', '6:6', 'wd:x', '4nb:x', '2b:x', '1lb:x']);
});

test('parseMatch rejects pages without match data', () => {
  assert.throws(() => P.parseMatch({ props: {} }), /No match data/);
});

test('parseTitleScore reads both Cricinfo title formats', () => {
  assert.deepEqual(
    P.parseTitleScore('BAN vs WI live score, BAN vs WI 2026/27: BAN 10/1 (7.4 ov, Mominul Haque 1*, Shadman Islam 1*, Shamar Joseph 0/4, 1st Test, day 1'),
    { abbr: 'BAN', score: '10/1', overs: '7.4' }
  );
  assert.deepEqual(
    P.parseTitleScore('BAN 9/1 (6.4 ov, Shadman Islam 1*, Jayden Seales 1/4, BAN vs WI live score, 1st Test'),
    { abbr: 'BAN', score: '9/1', overs: '6.4' }
  );
  assert.deepEqual(P.parseTitleScore('RLYS 184 & 107/9 (40.2 ov, X 3*'), { abbr: 'RLYS', score: '184 & 107/9', overs: '40.2' });
  assert.deepEqual(P.parseTitleScore('J & K 6/0 (3 ov, A 1*'), { abbr: 'J & K', score: '6/0', overs: '3' });
  assert.equal(P.parseTitleScore('Live Cricket Scores | ESPNcricinfo'), null);
});

test('oversToBalls', () => {
  assert.equal(P.oversToBalls('7 ov'), 42);
  assert.equal(P.oversToBalls('82.3 ov'), 495);
  assert.equal(P.oversToBalls('7.4'), 46);
  assert.equal(P.oversToBalls('(T:250) 45.2 ov'), 272);
  assert.equal(P.oversToBalls(''), -1);
});

test('parseMatchList builds URLs and puts live internationals first', () => {
  const mk = (state, intl, id, a, b) => ({
    objectId: id, slug: `m-${id}`, state, internationalClassId: intl, title: 'T', statusText: 'S', startTime: null,
    series: { slug: 's', objectId: 1, longName: 'Series' }, teams: [{ team: { abbreviation: a }, score: '1' }, { team: { abbreviation: b }, score: null }],
  });
  const nd = { props: { appPageProps: { data: { content: { matches: [mk('PRE', 1, 1, 'A', 'B'), mk('LIVE', null, 2, 'C', 'D'), mk('LIVE', 1, 3, 'E', 'F'), mk('RESULT', 1, 4, 'G', 'H')] } } } } };
  const list = P.parseMatchList(nd);
  assert.deepEqual(list.map((m) => m.matchId), [3, 2, 1, 4]);
  assert.equal(list[0].url, 'https://www.cricinfo.com/series/s-1/m-3-3/live-cricket-score');
  assert.deepEqual(list[0].teams, [{ abbr: 'E', score: '1' }, { abbr: 'F', score: '' }]);
});

// --- service worker, run in a sandbox with a fake chrome.* ------------------------

function makeChrome() {
  const areas = {};
  const changeListeners = [];
  const area = (name) => {
    const data = (areas[name] = {});
    return {
      data,
      async get(keys) {
        const ks = Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(ks.filter((k) => k in data).map((k) => [k, structuredClone(data[k])]));
      },
      async set(obj) {
        const changes = {};
        for (const [k, v] of Object.entries(obj)) {
          changes[k] = { oldValue: data[k], newValue: structuredClone(v) };
          data[k] = structuredClone(v);
        }
        changeListeners.forEach((fn) => fn(changes, name));
      },
      async remove(key) {
        delete data[key];
      },
    };
  };
  const listeners = {};
  const event = (name) => ({ addListener: (fn) => { listeners[name] = fn; } });
  const badge = {};
  return {
    listeners,
    badge,
    tabsList: [],
    executeResult: null,
    storage: { local: area('local'), session: area('session'), onChanged: { addListener: (fn) => changeListeners.push(fn) } },
    alarms: { async get() { return null; }, create() {}, onAlarm: event('alarm') },
    action: {
      setBadgeText: ({ text }) => { badge.text = text; },
      setBadgeBackgroundColor: ({ color }) => { badge.color = color; },
      setBadgeTextColor() {},
      setTitle: ({ title }) => { badge.title = title; },
    },
    runtime: { onMessage: event('message'), onInstalled: event('installed'), onStartup: event('startup'), getURL: (p) => 'chrome-extension://x/' + p },
    commands: { onCommand: event('command') },
    tabs: { query: async () => [], onRemoved: event('tabRemoved'), onUpdated: event('tabUpdated') },
    scripting: { executeScript: async () => [] },
  };
}

// By default the worker starts out following the BAN v WI fixture match; pass followed: null for a fresh install.
function loadWorker(fetchImpl, { followed = USER_URL } = {}) {
  const chrome = makeChrome();
  if (followed) chrome.storage.local.data.prefs = { matchUrl: followed };
  const ctx = { chrome, fetch: fetchImpl, console, URL, structuredClone, setTimeout };
  ctx.self = ctx;
  ctx.importScripts = (f) => vm.runInContext(fs.readFileSync(path.join(EXT, f), 'utf8'), ctx);
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(EXT, 'background.js'), 'utf8'), ctx);
  const message = (msg, sender = {}) => new Promise((resolve) => chrome.listeners.message(msg, sender, resolve));
  return { chrome, ctx, message };
}

const page = (nd) => `<!doctype html><html><head></head><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nd)}</script></body></html>`;
const okResponse = (body) => ({ ok: true, status: 200, text: async () => body });

test('worker: install writes defaults, fetches the score, sets the badge', async () => {
  let current = live;
  const w = loadWorker(async () => okResponse(page(current)));
  await w.chrome.listeners.installed();
  await w.message({ type: 'refresh' });
  const { prefs, score } = w.chrome.storage.local.data;
  assert.equal(prefs.matchUrl, USER_URL);
  assert.equal(prefs.enabled, true);
  assert.equal(score.teams[0].score, '10/1');
  assert.equal(score.error, null);
  assert.equal(w.chrome.badge.text, '10/1');
  assert.equal(w.chrome.badge.color, '#d92d20');
  assert.match(w.chrome.badge.title, /BAN 10\/1 {2}v {2}WI/);

  // A new wicket ball arrives: event raised; the next fetch keeps it rather than re-raising.
  current = JSON.parse(JSON.stringify(live));
  const c = current.props.appPageProps.data.data;
  c.match.teams[0].score = '10/2';
  c.content.supportInfo.liveSummary.recentBalls.unshift({ ...c.content.supportInfo.liveSummary.recentBalls[0], id: 54360020, overNumber: 8, ballNumber: 1, totalRuns: 0, batsmanRuns: 0, isWicket: true });
  w.chrome.storage.session.data.lastAttempt = 0;
  await w.message({ type: 'refresh' });
  const ev = w.chrome.storage.local.data.score.event;
  assert.equal(ev.kind, 'W');
  assert.equal(ev.id, 54360020);
  w.chrome.storage.session.data.lastAttempt = 0;
  await w.message({ type: 'refresh' });
  assert.equal(w.chrome.storage.local.data.score.event.at, ev.at);
});

test('worker: ticks respect the refresh interval', async () => {
  let calls = 0;
  const w = loadWorker(async () => { calls++; return okResponse(page(live)); });
  await w.chrome.listeners.installed();
  await w.message({ type: 'refresh' });
  const before = calls;
  await w.message({ type: 'tick' });
  await w.message({ type: 'tick' });
  assert.equal(calls, before, 'ticks inside the interval should not refetch');
  w.chrome.storage.session.data.lastAttempt = Date.now() - 20000;
  await w.message({ type: 'tick' });
  assert.equal(calls, before + 1);
});

test('worker: blocked fetch falls back to an open cricinfo tab', async () => {
  const w = loadWorker(async () => ({ ok: false, status: 403, text: async () => 'Access Denied' }));
  let injected = null;
  w.chrome.tabs.query = async (q) => (q.url === '*://*.cricinfo.com/*' ? [{ id: 7 }] : []);
  w.chrome.scripting.executeScript = async (opts) => {
    injected = opts;
    return [{ result: JSON.stringify(live) }];
  };
  await w.chrome.listeners.installed();
  await w.message({ type: 'refresh' });
  assert.equal(injected.target.tabId, 7);
  assert.equal(injected.args[0], new URL(USER_URL).pathname);
  assert.equal(w.chrome.storage.local.data.score.teams[0].score, '10/1');
});

test('worker: blocked with no cricinfo tab keeps the last score and reports the error', async () => {
  let blocked = false;
  const w = loadWorker(async () => (blocked ? { ok: false, status: 403, text: async () => '' } : okResponse(page(live))));
  await w.chrome.listeners.installed();
  await w.message({ type: 'refresh' });
  blocked = true;
  w.chrome.storage.session.data.lastAttempt = 0;
  await w.message({ type: 'refresh' });
  const s = w.chrome.storage.local.data.score;
  assert.equal(s.teams[0].score, '10/1');
  assert.equal(s.error, 'Cricinfo answered 403');
});

test('worker: open match tab title tops up a stale score, never rolls it back', async () => {
  const w = loadWorker(async () => okResponse(page(live)));
  await w.chrome.listeners.installed();
  await w.message({ type: 'refresh' });
  await w.message({ type: 'title', url: USER_URL, title: 'BAN vs WI live score, BAN vs WI 2026/27: BAN 12/1 (7.4 ov, Mominul Haque 3*' });
  let s = w.chrome.storage.local.data.score;
  assert.deepEqual([s.teams[0].score, s.teams[0].info], ['12/1', '7.4 ov']);
  assert.equal(w.chrome.badge.text, '12/1');
  // The next page fetch is older than the tab: keep the tab's numbers.
  w.chrome.storage.session.data.lastAttempt = 0;
  await w.message({ type: 'refresh' });
  s = w.chrome.storage.local.data.score;
  assert.equal(s.teams[0].score, '12/1');
  // A title from a different match or an older over is ignored.
  await w.message({ type: 'title', url: 'https://www.cricinfo.com/series/x-1/y-2/live-cricket-score', title: 'BAN 99/9 (50 ov,' });
  await w.message({ type: 'title', url: USER_URL, title: 'BAN 8/0 (6.1 ov, A' });
  assert.equal(w.chrome.storage.local.data.score.teams[0].score, '12/1');
});

test('worker: follow switches match; bad links are rejected', async () => {
  const urls = [];
  const w = loadWorker(async (u) => { urls.push(u); return okResponse(page(u.includes('3rd-test') ? others.saaus : live)); });
  await w.chrome.listeners.installed();
  const bad = await w.message({ type: 'follow', url: 'https://example.com' });
  assert.equal(bad.ok, false);
  const res = await w.message({ type: 'follow', url: 'https://www.espncricinfo.com/series/australia-in-south-africa-2026-27-1525634/south-africa-vs-australia-3rd-test-1525661/full-scorecard' });
  assert.equal(res.ok, true);
  assert.equal(w.chrome.storage.local.data.prefs.matchUrl, 'https://www.cricinfo.com/series/australia-in-south-africa-2026-27-1525634/south-africa-vs-australia-3rd-test-1525661/live-cricket-score');
  assert.equal(w.chrome.storage.local.data.score.teams[0].abbr, 'SA');
  assert.equal(w.chrome.badge.text, '329');
});

test('worker: tracks which tab hosts the floating window', async () => {
  const w = loadWorker(async () => okResponse(page(live)));
  await w.chrome.listeners.installed();
  const local = w.chrome.storage.local.data;
  const settle = () => new Promise((r) => setTimeout(r, 5));

  await w.message({ type: 'floating', open: true }, { tab: { id: 5 } });
  assert.equal(local.floating.tabId, 5);
  // Another tab closing its (old) window must not clear tab 5's.
  await w.message({ type: 'floating', open: false }, { tab: { id: 9 } });
  assert.equal(local.floating.tabId, 5);
  // Ticks from the host tab keep it fresh, without rewriting storage every 5 seconds.
  const at = local.floating.at;
  await w.message({ type: 'tick', pip: true }, { tab: { id: 5 } });
  assert.equal(local.floating.at, at);
  local.floating.at -= 70000;
  const stale = local.floating.at;
  await w.message({ type: 'tick', pip: true }, { tab: { id: 5 } });
  assert.ok(local.floating.at >= stale + 70000);
  // Navigating or closing the host tab clears it.
  w.chrome.listeners.tabUpdated(5, { status: 'complete' });
  await settle();
  assert.equal(local.floating.tabId, 5);
  w.chrome.listeners.tabUpdated(5, { status: 'loading' });
  await settle();
  assert.equal(local.floating, undefined);
  await w.message({ type: 'floating', open: true }, { tab: { id: 6 } });
  w.chrome.listeners.tabRemoved(6);
  await settle();
  assert.equal(local.floating, undefined);
});

test('worker: install resets the floating state and defaults to score-only', async () => {
  const w = loadWorker(async () => okResponse(page(live)));
  w.chrome.storage.local.data.floating = { tabId: 3, at: Date.now() };
  await w.chrome.listeners.installed();
  assert.equal(w.chrome.storage.local.data.floating, undefined);
  assert.equal(w.chrome.storage.local.data.prefs.pipCompact, true);
});

test('worker: a fresh install follows the top live international match', async () => {
  const mk = (state, intl, id) => ({
    objectId: id, slug: `m-${id}`, state, internationalClassId: intl, title: 'T', statusText: 'S', startTime: null,
    series: { slug: 's', objectId: 1, longName: 'Series' }, teams: [{ team: { abbreviation: 'A' }, score: '1' }, { team: { abbreviation: 'B' }, score: null }],
  });
  const list = { props: { appPageProps: { data: { content: { matches: [mk('LIVE', null, 1), mk('PRE', 1, 2), mk('LIVE', 1, 3)] } } } } };
  const fetched = [];
  const w = loadWorker(async (u) => {
    fetched.push(u);
    return okResponse(page(u === P.LIST_URL ? list : live));
  }, { followed: null });
  await w.chrome.listeners.installed();
  await w.message({ type: 'refresh' });
  assert.equal(w.chrome.storage.local.data.prefs.matchUrl, 'https://www.cricinfo.com/series/s-1/m-3-3/live-cricket-score');
  assert.equal(fetched[0], P.LIST_URL);
  assert.equal(w.chrome.storage.local.data.score.teams[0].abbr, 'BAN');
});

test('worker: keyboard shortcut toggles the widget', async () => {
  const w = loadWorker(async () => okResponse(page(live)));
  await w.chrome.listeners.installed();
  await w.chrome.listeners.command('toggle-widget');
  assert.equal(w.chrome.storage.local.data.prefs.enabled, false);
  await w.chrome.listeners.command('toggle-widget');
  assert.equal(w.chrome.storage.local.data.prefs.enabled, true);
});

(async () => {
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log('  ok  ', name);
    } catch (e) {
      failed++;
      console.log('  FAIL', name, '\n      ', e.message.split('\n').join('\n        '));
    }
  }
  console.log(failed ? `\n${failed} of ${tests.length} failed` : `\nall ${tests.length} passed`);
  process.exit(failed ? 1 : 0);
})();

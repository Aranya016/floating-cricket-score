// Service worker: fetches the followed match from Cricinfo, keeps the latest score in
// chrome.storage.local (every tab's widget renders from there) and shows it on the toolbar badge.
importScripts('parser.js');
const { LIST_URL, matchUrl, extractNextData, parseMatch, parseMatchList, parseTitleScore, oversToBalls } = self.CricParser;

const DEFAULT_PREFS = {
  enabled: true,
  matchUrl: null, // picked automatically on first run (see autoPick), or by the user in the menu
  interval: 20, // seconds between refreshes while a match is live
  collapsed: false, // the card inside pages
  pipCompact: true, // the floating window shows just the score until clicked
  pos: null, // where the card inside pages sits, shared by all tabs
};

async function getPrefs() {
  const { prefs } = await chrome.storage.local.get('prefs');
  return { ...DEFAULT_PREFS, ...prefs };
}

async function setPrefs(patch) {
  const prefs = { ...(await getPrefs()), ...patch };
  await chrome.storage.local.set({ prefs });
  return prefs;
}

// --- Fetching -------------------------------------------------------------

// Runs inside an open Cricinfo tab, so the request is an ordinary same-site page load.
function fetchInPage(path) {
  return fetch(path, { credentials: 'omit', cache: 'no-store' })
    .then((r) => (r.ok ? r.text() : null))
    .then((t) => {
      if (!t) return null;
      const i = t.indexOf('id="__NEXT_DATA__"');
      if (i < 0) return null;
      const s = t.indexOf('>', i) + 1;
      return t.slice(s, t.indexOf('</script>', s));
    })
    .catch(() => null);
}

async function fetchNextData(url) {
  let firstError;
  try {
    const res = await fetch(url, { credentials: 'omit', cache: 'no-store' });
    if (!res.ok) throw new Error(`Cricinfo answered ${res.status}`);
    const nd = extractNextData(await res.text());
    if (nd) return nd;
    throw new Error('Score data missing from the Cricinfo page');
  } catch (e) {
    firstError = e;
  }
  // Fallback: ask an open cricinfo.com tab to load the page for us.
  const path = new URL(url).pathname;
  const tabs = await chrome.tabs.query({ url: '*://*.cricinfo.com/*' });
  for (const tab of tabs) {
    try {
      const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: fetchInPage, args: [path] });
      if (r && r.result) return JSON.parse(r.result);
    } catch (_) {
      // tab may be discarded or still loading; try the next one
    }
  }
  throw firstError;
}

// --- Score state -------------------------------------------------------------

const EVENT_RANK = { W: 3, 6: 2, 4: 1 };

// A wicket, six or four among the balls that arrived since the last fetch.
function detectEvent(prev, next) {
  if (!prev || prev.matchId !== next.matchId || !Array.isArray(prev.recent)) return null;
  const lastSeen = prev.recent.reduce((max, b) => Math.max(max, b.id || 0), 0);
  let best = null;
  for (const b of next.recent) {
    if (b.id > lastSeen && EVENT_RANK[b.k] && (!best || EVENT_RANK[b.k] >= EVENT_RANK[best.k])) best = b;
  }
  return best ? { id: best.id, kind: best.k, at: Date.now() } : prev.event || null;
}

// Top up the score with the fresher numbers from an open Cricinfo tab's title.
function applyBoost(score, boost) {
  if (!boost || !score || !score.teams || boost.url !== score.url || Date.now() - boost.at > 180000) return false;
  const team = score.teams.find((t) => t.abbr === boost.abbr);
  if (!team) return false;
  const pageBalls = oversToBalls(team.info);
  const tabBalls = oversToBalls(boost.overs);
  if (tabBalls < pageBalls || (tabBalls === pageBalls && team.score === boost.score)) return false;
  team.score = boost.score;
  team.info = `${boost.overs} ov`;
  score.boostedAt = boost.at;
  return true;
}

function updateBadge(score) {
  const teams = (score && score.teams) || [];
  const team = teams.find((t) => t.batting) || [...teams].reverse().find((t) => t.score);
  let text = '';
  if (team && team.score) {
    const last = team.score.split('&').pop().trim();
    text = last.length <= 4 ? last : last.split('/')[0];
  }
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: score && score.phase === 'live' ? '#d92d20' : '#475467' });
  if (chrome.action.setBadgeTextColor) chrome.action.setBadgeTextColor({ color: '#ffffff' });
  const line = teams.map((t) => `${t.abbr} ${t.score || ''}`.trim()).join('  v  ');
  chrome.action.setTitle({ title: line ? `${line}\n${score.statusText || ''}`.trim() : 'Floating Cricket Score' });
}

function minGap(prefs, score) {
  const live = Math.max(10, prefs.interval || 20) * 1000 - 1000;
  if (!score || score.url !== prefs.matchUrl || !score.teams) return score && score.error ? 45000 : 0;
  if (score.error) return Math.max(live, 45000);
  let gap = score.phase === 'live' ? live : score.phase === 'pre' ? 120000 : 600000;
  if (score.phase === 'pre' && score.startTime && Date.parse(score.startTime) - Date.now() < 5 * 60000) gap = live;
  if (!prefs.enabled) gap = Math.max(gap, 120000); // widget hidden: only the badge needs it
  return gap;
}

let inflight = null;

function refresh(force) {
  if (!inflight) inflight = doRefresh(force).finally(() => { inflight = null; });
  return inflight;
}

// With no match chosen yet (a fresh install), follow the biggest live match: internationals first.
async function autoPick(prefs) {
  const { lastPick = 0 } = await chrome.storage.session.get('lastPick');
  if (Date.now() - lastPick < 120000) return prefs;
  await chrome.storage.session.set({ lastPick: Date.now() });
  let items;
  try {
    items = await listMatches();
  } catch (_) {
    return prefs;
  }
  const pick = items.find((m) => m.intl && m.phase === 'live') || items.find((m) => m.intl && m.phase === 'pre') ||
    items.find((m) => m.phase === 'live') || items[0];
  return pick ? setPrefs({ matchUrl: pick.url }) : prefs;
}

async function doRefresh(force) {
  let prefs = await getPrefs();
  if (!prefs.matchUrl) prefs = await autoPick(prefs);
  if (!prefs.matchUrl) return;
  const { score: prev } = await chrome.storage.local.get('score');
  const { lastAttempt = 0 } = await chrome.storage.session.get('lastAttempt');
  const gap = force ? 3000 : minGap(prefs, prev);
  if (Date.now() - lastAttempt < gap) return;
  await chrome.storage.session.set({ lastAttempt: Date.now() });

  let score;
  try {
    const data = parseMatch(await fetchNextData(prefs.matchUrl));
    score = { ...data, url: prefs.matchUrl, fetchedAt: Date.now(), error: null };
    score.event = detectEvent(prev, score);
    const { boost } = await chrome.storage.session.get('boost');
    applyBoost(score, boost);
  } catch (e) {
    const msg = String((e && e.message) || e);
    score = prev && prev.url === prefs.matchUrl && prev.teams
      ? { ...prev, error: msg, errorAt: Date.now() }
      : { url: prefs.matchUrl, error: msg, errorAt: Date.now() };
  }
  if ((await getPrefs()).matchUrl !== prefs.matchUrl) return; // user switched match meanwhile
  await chrome.storage.local.set({ score });
  updateBadge(score);
}

async function follow(input) {
  const url = matchUrl(input);
  if (!url) throw new Error("That doesn't look like a Cricinfo match link");
  await setPrefs({ matchUrl: url, enabled: true });
  await chrome.storage.local.set({ score: { url, loading: true } });
  await chrome.storage.session.set({ lastAttempt: 0 });
  updateBadge(null);
  if (inflight) await inflight.catch(() => {});
  await refresh(true);
  return url;
}

async function listMatches() {
  const { list } = await chrome.storage.session.get('list');
  if (list && Date.now() - list.at < 60000) return list.items;
  const items = parseMatchList(await fetchNextData(LIST_URL));
  await chrome.storage.session.set({ list: { at: Date.now(), items } });
  return items;
}

async function onTitle(url, title) {
  const prefs = await getPrefs();
  if (matchUrl(url) !== prefs.matchUrl) return;
  const parsed = parseTitleScore(title);
  if (!parsed) return;
  const boost = { ...parsed, url: prefs.matchUrl, at: Date.now() };
  await chrome.storage.session.set({ boost });
  const { score } = await chrome.storage.local.get('score');
  if (applyBoost(score, boost)) {
    await chrome.storage.local.set({ score });
    updateBadge(score);
  }
}

// Which tab hosts the floating window, so the cards inside pages can step aside meanwhile.
// The host tab re-confirms with every tick; content.js stops trusting it after a few minutes.
async function setFloating(tabId, open) {
  if (tabId == null) return;
  const { floating } = await chrome.storage.local.get('floating');
  if (open) {
    if (floating && floating.tabId === tabId && Date.now() - floating.at < 60000) return;
    await chrome.storage.local.set({ floating: { tabId, at: Date.now() } });
  } else if (floating && floating.tabId === tabId) {
    await chrome.storage.local.remove('floating');
  }
}

// --- Wiring ----------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const tabId = sender.tab && sender.tab.id;
  const jobs = {
    tick: () => Promise.all([refresh(false), msg.pip ? setFloating(tabId, true) : null]),
    refresh: () => refresh(true),
    follow: () => follow(msg.url),
    list: () => listMatches(),
    title: () => onTitle(msg.url, msg.title),
    floating: () => setFloating(tabId, !!msg.open),
  };
  const job = jobs[msg && msg.type];
  if (!job) return false;
  job().then(
    (result) => reply({ ok: true, result }),
    (e) => reply({ ok: false, error: String((e && e.message) || e) })
  );
  return true;
});

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'poll') refresh(false);
});

chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd === 'toggle-widget') {
    const prefs = await getPrefs();
    await setPrefs({ enabled: !prefs.enabled });
  }
});

async function ensureAlarm() {
  if (!(await chrome.alarms.get('poll'))) chrome.alarms.create('poll', { periodInMinutes: 0.5 });
}

// The floating window dies with its tab's page.
chrome.tabs.onRemoved.addListener((tabId) => setFloating(tabId, false));
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading') setFloating(tabId, false);
});

chrome.runtime.onInstalled.addListener(async () => {
  await setPrefs({}); // write defaults so content scripts can read them
  await chrome.storage.local.remove('floating');
  await ensureAlarm();
  // Show the widget in tabs that were already open, without needing a reload.
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  for (const tab of tabs) {
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['widget.js', 'content.js'] }).catch(() => {});
  }
  refresh(true);
});

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.remove('floating');
  ensureAlarm();
});
ensureAlarm();

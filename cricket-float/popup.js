const $ = (id) => document.getElementById(id);
const { matchUrl } = self.CricParser;
const W = self.CricWidget;

let prefs = {};
let score = null;
let matches = [];

const cardHost = $('current').attachShadow({ mode: 'open' });
W.adoptStyles(cardHost);
const cardBox = document.createElement('div');
cardHost.append(cardBox);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function ask(msg) {
  const res = await chrome.runtime.sendMessage(msg);
  if (!res || !res.ok) throw new Error((res && res.error) || 'No answer from the extension');
  return res.result;
}

function showError(e) {
  $('err').hidden = !e;
  $('err').textContent = e ? String(e.message || e) : '';
}

async function savePrefs(patch) {
  const { prefs: current } = await chrome.storage.local.get('prefs');
  prefs = { ...current, ...patch };
  await chrome.storage.local.set({ prefs });
}

function drawCurrent() {
  if (!prefs.matchUrl) {
    cardBox.innerHTML = '<div class="msg">Pick a match below and its score will float.</div>';
    return;
  }
  W.render(cardBox, score && score.url === prefs.matchUrl ? score : null, { mode: 'inline' });
}

function drawList() {
  const ul = $('matches');
  if (!matches.length) {
    ul.innerHTML = '<li class="hint">No live or upcoming matches listed right now.</li>';
    return;
  }
  ul.innerHTML = matches.map((m) => {
    const teams = m.teams.map((t) => `<b>${esc(t.abbr)}</b> ${esc(t.score)}`).join(' <span>v</span> ');
    const state = m.phase === 'live' ? 'Live' : m.phase === 'pre' ? 'Upcoming' : 'Result';
    return `<li data-url="${esc(m.url)}" class="${m.url === prefs.matchUrl ? 'on' : ''}" title="${esc(m.status)}">` +
      `<span class="m-teams">${teams}</span><span class="m-state ${m.phase}">${state}</span>` +
      `<span class="m-meta">${esc([m.title, m.series].filter(Boolean).join(' · '))}</span></li>`;
  }).join('');
}

async function loadList() {
  $('matches').innerHTML = '<li class="hint">Loading matches…</li>';
  try {
    matches = await ask({ type: 'list' });
    drawList();
  } catch (e) {
    $('matches').innerHTML = `<li class="hint">Couldn't load the match list (${esc(e.message)}). You can still paste a link below.</li>`;
  }
}

async function followUrl(url) {
  showError(null);
  try {
    await ask({ type: 'follow', url });
  } catch (e) {
    showError(e);
  }
}

async function checkActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab && matchUrl(tab.url);
  const btn = $('this-tab');
  btn.hidden = !url || url === prefs.matchUrl;
  if (!btn.hidden) {
    btn.textContent = 'Float the match in this tab';
    btn.onclick = () => followUrl(url);
  }
}

// --- Floating window ---------------------------------------------------------------
// The floating window has to belong to a web page, so the button asks content.js in the
// current tab to open it. Doing it from this click lets the browser allow the window.

const FLOAT_ERRORS = {
  unsupported: 'This browser can’t open floating windows. It needs Chrome or Brave 116 or newer.',
  blocked: 'The score can’t float from this kind of tab (new tab, settings or the extension store). Switch to any normal website and try again.',
};

const FLOATING_TTL = 150000;
let floating = null;
const isFloating = () => !!floating && Date.now() - floating.at < FLOATING_TTL;

function callFloatApi(action, arg) {
  const api = globalThis.cricFloatApi;
  return api ? api[action](arg) : 'no-widget';
}

async function runInTab(tabId, action, arg = true) {
  const [r] = await chrome.scripting.executeScript({ target: { tabId }, func: callFloatApi, args: [action, arg] });
  return r && r.result;
}

// Brave labels the floating window with the site of the tab it floats from, so an open
// Cricinfo tab makes the nicest host ("cricinfo.com"). The match's own tab also has the freshest score.
async function cricinfoHosts(activeId) {
  const tabs = await chrome.tabs.query({ url: '*://*.cricinfo.com/*' });
  return tabs
    .filter((t) => t.id !== activeId && !t.discarded)
    .sort((a, b) => (matchUrl(b.url) === prefs.matchUrl) - (matchUrl(a.url) === prefs.matchUrl));
}

function drawFloatButton() {
  $('float').textContent = isFloating() ? 'Stop floating' : 'Float score';
  $('float-hint').hidden = isFloating();
}

async function toggleFloat() {
  showError(null);
  if (isFloating()) {
    await runInTab(floating.tabId, 'unpop').catch(() => chrome.storage.local.remove('floating'));
    return;
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  for (const host of await cricinfoHosts(tab.id)) {
    const hosted = await runInTab(host.id, 'pop', false).catch(() => null);
    if (hosted === 'ok') return window.close();
  }
  let result;
  try {
    result = await runInTab(tab.id, 'pop');
    if (result === 'no-widget') {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['widget.js', 'content.js'] });
      result = await runInTab(tab.id, 'pop');
    }
  } catch (_) {
    result = 'blocked';
  }
  // 'not-allowed': the page now shows a "Click to float the score" button; get out of its way.
  if (result === 'ok' || result === 'not-allowed') window.close();
  else showError(FLOAT_ERRORS[result] || `Couldn’t float the score: ${result}`);
}

$('float').addEventListener('click', toggleFloat);
$('enabled').addEventListener('change', (e) => savePrefs({ enabled: e.target.checked }));
$('interval').addEventListener('change', (e) => savePrefs({ interval: Number(e.target.value) }));
$('reset-pos').addEventListener('click', () => savePrefs({ pos: null }));
$('refresh').addEventListener('click', () => ask({ type: 'refresh' }).catch(showError));
$('reload-list').addEventListener('click', loadList);
$('matches').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-url]');
  if (li) followUrl(li.dataset.url);
});
$('paste').addEventListener('submit', (e) => {
  e.preventDefault();
  const url = $('url').value.trim();
  if (url) followUrl(url).then(() => { $('url').value = ''; });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.prefs) prefs = changes.prefs.newValue || {};
  if (changes.score) score = changes.score.newValue || null;
  if (changes.floating) floating = changes.floating.newValue || null;
  $('enabled').checked = prefs.enabled !== false;
  drawFloatButton();
  drawCurrent();
  drawList();
  checkActiveTab();
});

(async () => {
  ({ prefs = {}, score = null, floating = null } = await chrome.storage.local.get(['prefs', 'score', 'floating']));
  $('enabled').checked = prefs.enabled !== false;
  drawFloatButton();
  $('interval').value = String(prefs.interval || 20);
  drawCurrent();
  checkActiveTab();
  loadList();
  ask({ type: 'tick' }).catch(() => {});
})();

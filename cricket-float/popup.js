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
    btn.textContent = 'Follow the match in this tab';
    btn.onclick = () => followUrl(url);
  }
}

// The score stays in one window; this moves it to the window the menu was opened from.
async function checkWindow() {
  const [win, { homeWindow }] = await Promise.all([chrome.windows.getCurrent(), chrome.storage.local.get('homeWindow')]);
  const btn = $('this-window');
  btn.hidden = homeWindow == null || homeWindow === win.id;
  btn.onclick = () => ask({ type: 'showHere', windowId: win.id }).then(() => window.close(), showError);
}

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
  $('enabled').checked = prefs.enabled !== false;
  drawCurrent();
  drawList();
  checkActiveTab();
  if (changes.homeWindow) checkWindow();
});

(async () => {
  ({ prefs = {}, score = null } = await chrome.storage.local.get(['prefs', 'score']));
  $('enabled').checked = prefs.enabled !== false;
  $('interval').value = String(prefs.interval || 20);
  drawCurrent();
  checkActiveTab();
  checkWindow();
  loadList();
  ask({ type: 'tick' }).catch(() => {});
})();

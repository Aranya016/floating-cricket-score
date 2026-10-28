// Fake chrome.* so the extension's pages can be previewed in an ordinary tab (dev only).
// Query params: state=live|pre|stumps|error|nodata|loading, collapsed=1, tab=<active tab url>.
(() => {
  const q = new URLSearchParams(location.search);
  const URLS = {
    live: 'https://www.cricinfo.com/series/west-indies-in-bangladesh-2026-27-1553291/bangladesh-vs-west-indies-1st-test-1553295/live-cricket-score',
    stumps: 'https://www.cricinfo.com/series/australia-in-south-africa-2026-27-1525634/south-africa-vs-australia-3rd-test-1525661/live-cricket-score',
    pre: 'https://www.cricinfo.com/series/zimbabwe-women-in-india-2026-27-1535648/india-women-vs-zimbabwe-women-3rd-odi-1535657/live-cricket-score',
  };
  const data = {};
  const listeners = [];
  let fixtures = {};

  const loadScript = (src) => new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    document.head.append(s);
  });

  function scoreFor(url, state) {
    if (state === 'loading') return { url, loading: true };
    if (state === 'nodata') return { url, error: 'Cricinfo answered 403', errorAt: Date.now() };
    const s = { ...self.CricParser.parseMatch(fixtures[url]), url, fetchedAt: Date.now() - 12000, error: null };
    if (state === 'error') Object.assign(s, { error: 'Cricinfo answered 403', fetchedAt: Date.now() - 180000 });
    return s;
  }

  const ready = (async () => {
    if (!self.CricParser) await loadScript('/cricket-float/parser.js');
    const [live, others] = await Promise.all(['ban-wi-live', 'other-states'].map((n) => fetch(`/dev/fixtures/${n}.json`).then((r) => r.json())));
    fixtures = { [URLS.live]: live, [URLS.stumps]: others.saaus, [URLS.pre]: others.pre };
    const state = q.get('state') || 'live';
    const url = URLS[state] || URLS.live;
    data.prefs = { enabled: true, matchUrl: url, interval: 20, collapsed: q.get('collapsed') === '1', pos: null };
    data.score = scoreFor(url, state);
  })();

  function set(obj) {
    const changes = {};
    for (const [k, v] of Object.entries(obj)) {
      changes[k] = { oldValue: data[k], newValue: structuredClone(v) };
      data[k] = structuredClone(v);
    }
    listeners.forEach((fn) => fn(changes, 'local'));
  }

  function list() {
    const fromFixtures = Object.entries(fixtures).map(([url, nd]) => {
      const s = self.CricParser.parseMatch(nd);
      return { url, matchId: s.matchId, title: s.title, series: s.series, phase: s.phase, intl: true, status: s.statusText, teams: s.teams.map((t) => ({ abbr: t.abbr, score: t.score })) };
    });
    const domestic = [
      ['NAGA', '187 & 79/5', 'SIKM', '184', 'Plate Group', 'Ranji Trophy'],
      ['DELHI', '515/5d', 'JHK', '131/4', 'Elite, Group C', 'Ranji Trophy'],
      ['WA', '138/1', 'SOA', '', '7th Match', 'Sheffield Shield'],
    ].map(([a, as, b, bs, title, series], i) => ({ url: `https://www.cricinfo.com/series/x-${i}/y-${i}/live-cricket-score`, matchId: i, title, series, phase: 'live', intl: false, status: '', teams: [{ abbr: a, score: as }, { abbr: b, score: bs }] }));
    return [...fromFixtures.filter((m) => m.phase === 'live'), ...domestic, ...fromFixtures.filter((m) => m.phase !== 'live')];
  }

  async function handle(msg) {
    await ready;
    if (msg.type === 'list') return { ok: true, result: list() };
    if (msg.type === 'follow') {
      const url = self.CricParser.matchUrl(msg.url);
      if (!url) return { ok: false, error: "That doesn't look like a Cricinfo match link" };
      set({ prefs: { ...data.prefs, matchUrl: url, enabled: true }, score: fixtures[url] ? scoreFor(url, 'live') : { url, error: 'Not in the dev fixtures' } });
      return { ok: true, result: url };
    }
    return { ok: true, result: null };
  }

  self.chrome = {
    runtime: { id: 'mock', sendMessage: handle, getURL: (p) => '/cricket-float/' + p },
    storage: {
      local: {
        async get(keys) {
          await ready;
          const ks = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(ks.filter((k) => k in data).map((k) => [k, structuredClone(data[k])]));
        },
        async set(obj) {
          await ready;
          set(obj);
        },
      },
      onChanged: { addListener: (fn) => listeners.push(fn) },
    },
    tabs: { query: async () => [{ url: q.get('tab') || 'https://example.com/' }] },
  };

  // Hooks for poking the preview from devtools / automation.
  self.__mock = {
    data,
    ready,
    event(kind) {
      set({ score: { ...data.score, event: { id: Date.now(), kind, at: Date.now() } } });
    },
    state(state) {
      set({ score: scoreFor(URLS[state] || URLS.live, state) });
    },
  };
})();

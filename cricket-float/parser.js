// Turns Cricinfo page data (the __NEXT_DATA__ JSON embedded in every match page)
// into the small score object the widget renders. Shared by the service worker and tests.
(function (root) {
  const BASE = 'https://www.cricinfo.com';
  const LIST_URL = BASE + '/live-cricket-score';

  // Any Cricinfo/ESPNcricinfo match link -> canonical live-score URL, or null.
  function matchUrl(input) {
    const m = String(input || '').match(/\/series\/([a-z0-9-]+-\d+)\/([a-z0-9-]+-\d+)/i);
    return m ? `${BASE}/series/${m[1].toLowerCase()}/${m[2].toLowerCase()}/live-cricket-score` : null;
  }

  function extractNextData(html) {
    const i = html.indexOf('id="__NEXT_DATA__"');
    if (i < 0) return null;
    const start = html.indexOf('>', i) + 1;
    const end = html.indexOf('</script>', start);
    if (start <= 0 || end < 0) return null;
    return JSON.parse(html.slice(start, end));
  }

  // Cricinfo leaves some strings as client-side templates, e.g. "Match starts in {{MATCH_START_HOURS}}".
  const clean = (s) => (typeof s === 'string' && !s.includes('{{') ? s.trim() : '');
  const num = (x) => (typeof x === 'number' && isFinite(x) && x > 0 ? x : null);
  const phaseOf = (state) => {
    const s = String(state || '').toUpperCase();
    return s === 'LIVE' ? 'live' : s === 'PRE' ? 'pre' : 'done';
  };
  const playerName = (p) => (p && (p.longName || p.name || p.battingName)) || '';

  function ballLabel(b) {
    const extra = b.totalRuns > 1 ? b.totalRuns - 1 : '';
    if (b.isWicket) return { t: 'W', k: 'W' };
    if (b.wides) return { t: extra + 'wd', k: 'x' };
    if (b.noballs) return { t: extra + 'nb', k: 'x' };
    if (b.isSix) return { t: '6', k: '6' };
    if (b.isFour) return { t: '4', k: '4' };
    if (b.byes) return { t: b.byes + 'b', k: 'x' };
    if (b.legbyes) return { t: b.legbyes + 'lb', k: 'x' };
    return b.totalRuns ? { t: String(b.totalRuns), k: 'r' } : { t: '•', k: '0' };
  }

  // Who faces the next ball, worked out from the last delivery. Unknown after a wicket.
  function strikerId(last, ballsPerOver) {
    if (!last || last.isWicket) return null;
    let s = last.batsmanPlayerId;
    let n = last.nonStrikerPlayerId;
    const ran = (last.batsmanRuns || 0) + (last.byes || 0) + (last.legbyes || 0) + (last.wides > 1 ? last.wides - 1 : 0);
    if (ran % 2 === 1) [s, n] = [n, s];
    const legal = !last.wides && !last.noballs;
    if (legal && last.ballNumber >= (ballsPerOver || 6)) [s, n] = [n, s];
    return s;
  }

  function pageData(nd) {
    const d = nd && nd.props && nd.props.appPageProps && nd.props.appPageProps.data;
    return (d && d.data) || d || null;
  }

  function parseMatch(nd) {
    const d = pageData(nd);
    const m = d && d.match;
    if (!m || !Array.isArray(m.teams)) throw new Error('No match data found on the Cricinfo page');
    const c = d.content || {};
    const info = (m.statusData && m.statusData.statusTextLangData) || {};
    const support = c.supportInfo || {};
    const liveInfo = support.liveInfo || {};
    const phase = phaseOf(m.state);

    const teams = m.teams.map((t) => {
      const tm = t.team || {};
      return {
        id: tm.id,
        abbr: tm.abbreviation || tm.name || '?',
        name: tm.longName || tm.name || '',
        color: tm.primaryColor || null,
        score: t.score || '',
        info: t.scoreInfo || '',
        batting: phase === 'live' && !!t.isLive,
      };
    });

    // Newest first on the page; keep the current innings only.
    let balls = (support.liveSummary && support.liveSummary.recentBalls) ||
      (c.recentBallCommentary && c.recentBallCommentary.ballComments) || [];
    const last = balls[0] || null;
    if (last) balls = balls.filter((b) => b.inningNumber === last.inningNumber);
    const recent = balls.slice(0, 8).reverse().map((b) => Object.assign(ballLabel(b), { id: b.id, o: b.overNumber }));

    const perf = c.livePerformance || {};
    const sid = strikerId(last, m.ballsPerOver);
    const batters = phase !== 'live' ? [] : (perf.batsmen || []).map((b) => ({
      name: playerName(b.player),
      runs: b.runs ?? 0,
      balls: b.balls ?? 0,
      fours: b.fours ?? 0,
      sixes: b.sixes ?? 0,
      striker: !!sid && !!b.player && b.player.id === sid,
    }));
    const bowlers = perf.bowlers || [];
    const cur = bowlers.find((b) => b.currentType === 1) || bowlers[0];
    const bowler = phase !== 'live' || !cur ? null : {
      name: playerName(cur.player),
      overs: cur.overs ?? 0,
      maidens: cur.maidens ?? 0,
      runs: cur.conceded ?? 0,
      wickets: cur.wickets ?? 0,
    };

    return {
      matchId: m.objectId,
      phase,
      status: clean(m.status), // short label: "Live", "Stumps", "Lunch", "Innings break"...
      statusText: clean(m.statusText),
      title: clean(m.title),
      format: m.format || '',
      series: (m.series && (m.series.longName || m.series.name)) || '',
      ground: (m.ground && (m.ground.smallName || m.ground.name)) || '',
      day: m.format === 'TEST' ? m.liveDay || null : null,
      startTime: m.startTime || null,
      generatedAt: m.generatedAt || null,
      teams,
      batters,
      bowler,
      recent,
      crr: num(info.crr ?? liveInfo.currentRunRate),
      rrr: num(info.rrr ?? liveInfo.requiredRunrate),
    };
  }

  const PHASE_RANK = { live: 0, pre: 1, done: 2 };

  function parseMatchList(nd) {
    const d = pageData(nd);
    const list = (d && d.content && d.content.matches) || [];
    return list
      .filter((x) => x && x.series && x.slug && Array.isArray(x.teams))
      .map((x) => ({
        url: `${BASE}/series/${x.series.slug}-${x.series.objectId}/${x.slug}-${x.objectId}/live-cricket-score`,
        matchId: x.objectId,
        title: clean(x.title),
        series: x.series.longName || x.series.name || '',
        phase: phaseOf(x.state),
        intl: x.internationalClassId != null,
        status: clean(x.statusText),
        startTime: x.startTime || null,
        teams: x.teams.map((t) => ({ abbr: (t.team && t.team.abbreviation) || '?', score: t.score || '' })),
      }))
      .sort((a, b) => (PHASE_RANK[a.phase] * 2 + (a.intl ? 0 : 1)) - (PHASE_RANK[b.phase] * 2 + (b.intl ? 0 : 1)));
  }

  // An open Cricinfo match tab updates its title every few seconds, e.g.
  // "BAN vs WI live score, BAN vs WI 2026/27: BAN 10/1 (7.4 ov, Mominul Haque 1*, ...".
  // That is fresher than the page HTML, so we use it to top up the score when it is available.
  function parseTitleScore(title) {
    const m = String(title || '').match(
      /(?:^|[:,]\s*)([A-Z][A-Z0-9&\- ]{0,9}?)\s+(\d+(?:\/\d+)?d?(?:\s*&\s*\d+(?:\/\d+)?d?)?)\s+\((\d+(?:\.\d+)?)\s*ov/
    );
    return m ? { abbr: m[1].trim(), score: m[2], overs: m[3] } : null;
  }

  const oversToBalls = (s) => {
    const m = String(s || '').match(/(\d+)(?:\.(\d))?(?=\s*ov|\s*$)/);
    return m ? Number(m[1]) * 6 + Number(m[2] || 0) : -1;
  };

  root.CricParser = { BASE, LIST_URL, matchUrl, extractNextData, parseMatch, parseMatchList, parseTitleScore, oversToBalls };
  if (typeof module !== 'undefined') module.exports = root.CricParser;
})(typeof self !== 'undefined' ? self : globalThis);

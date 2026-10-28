// Score card markup and styles, shared by the in-page widget (content.js),
// the floating picture-in-picture window, and the toolbar menu.
(function (root) {
  if (root.CricWidget) return;

  const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.card, .pill, .msg { font: 12px/1.35 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #f2f4f7; }
.card {
  position: relative; width: 284px; overflow: hidden; user-select: none;
  background: rgba(15, 19, 27, 0.93); backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.09); border-radius: 14px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.38);
}
.card.full { width: 100%; min-height: 100vh; border: 0; border-radius: 0; box-shadow: none; backdrop-filter: none; background: #0f131b; }
.card.inline { width: 100%; box-shadow: none; backdrop-filter: none; background: #161b26; }
.bar { display: flex; align-items: center; gap: 6px; padding: 7px 6px 5px 10px; }
.drag { cursor: grab; }
.drag:active { cursor: grabbing; }
.badge { flex: none; font-size: 9.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; padding: 2px 7px; border-radius: 999px; background: #344054; color: #fff; }
.badge.live { background: #d92d20; }
.badge.live::before { content: ""; display: inline-block; width: 5px; height: 5px; margin: 0 4px 1px 0; border-radius: 50%; background: #fff; }
.badge.brk { background: #b54708; }
.meta { flex: 1; min-width: 0; color: #98a2b3; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.acts { display: flex; gap: 1px; flex: none; }
button { all: unset; cursor: pointer; width: 22px; height: 22px; display: grid; place-items: center; border-radius: 6px; color: #98a2b3; }
button:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }
svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.teams { padding: 1px 12px 7px; }
.team { display: flex; align-items: baseline; gap: 8px; padding: 2px 0; color: #98a2b3; }
.team i { flex: none; width: 4px; height: 14px; border-radius: 2px; background: #475467; align-self: center; }
.team b { flex: none; min-width: 40px; font-weight: 600; }
.team .sc { font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; color: #d0d5dd; white-space: nowrap; }
.team .sc.dim { font-size: 12px; font-weight: 500; color: #667085; }
.team.bat { color: #fff; }
.team.bat .sc { font-size: 21px; color: #fff; letter-spacing: -.01em; }
.team .ov { margin-left: auto; color: #98a2b3; font-size: 11px; white-space: nowrap; }
.sec { padding: 6px 12px; border-top: 1px solid rgba(255, 255, 255, 0.06); }
.p { display: flex; justify-content: space-between; gap: 8px; padding: 1px 0; }
.p .n { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #d0d5dd; }
.p.on .n { color: #fff; font-weight: 600; }
.p em { font-style: normal; color: #f97066; }
.p .v { flex: none; font-weight: 600; font-variant-numeric: tabular-nums; }
.p small { color: #98a2b3; font-weight: 400; font-size: 11px; }
.p u { text-decoration: none; color: #667085; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; margin-right: 6px; }
.balls { display: flex; align-items: center; gap: 4px; overflow: hidden; }
.ball { flex: none; min-width: 20px; height: 20px; padding: 0 4px; border-radius: 999px; display: grid; place-items: center; font-size: 10.5px; font-weight: 700; background: rgba(255, 255, 255, 0.08); color: #d0d5dd; }
.ball.k-0 { color: #667085; }
.ball.k-W { background: #d92d20; color: #fff; }
.ball.k-4 { background: #1570ef; color: #fff; }
.ball.k-6 { background: #7a5af8; color: #fff; }
.ball.k-x { background: rgba(253, 176, 34, 0.16); color: #fdb022; }
.sep { flex: none; width: 1px; height: 14px; background: rgba(255, 255, 255, 0.16); margin: 0 2px; }
.foot { padding-bottom: 8px; }
.foot .st { color: #d0d5dd; font-size: 11.5px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.foot .fm { display: flex; justify-content: space-between; gap: 8px; margin-top: 2px; color: #98a2b3; font-size: 10.5px; }
.upd { flex: none; color: #667085; }
.upd.err { color: #fdb022; }
.msg { padding: 10px 12px 12px; color: #d0d5dd; }
.msg small { display: block; margin-top: 4px; color: #98a2b3; font-size: 11px; }
.flash { position: absolute; inset: 0; display: grid; place-items: center; font-size: 32px; font-weight: 800; letter-spacing: .05em; color: #fff; pointer-events: none; animation: flash 3.8s ease forwards; }
.flash.k-W { background: rgba(217, 45, 32, 0.9); }
.flash.k-4 { background: rgba(21, 112, 239, 0.9); }
.flash.k-6 { background: rgba(122, 90, 248, 0.92); }
.pill {
  display: inline-flex; align-items: center; gap: 6px; padding: 8px 13px 8px 11px; white-space: nowrap; user-select: none; cursor: grab;
  font-size: 13px; font-weight: 600; background: rgba(15, 19, 27, 0.93); backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.09); border-radius: 999px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}
.pill .sc { font-variant-numeric: tabular-nums; }
.pill .ov, .pill .vs { color: #98a2b3; font-weight: 500; font-size: 11.5px; }
.pill button { width: 20px; height: 20px; margin: -3px -7px -3px 1px; }
.pill button svg { width: 13px; height: 13px; }
.pill.fill {
  display: flex; justify-content: safe center; gap: 8px; width: 100%; height: 100vh; padding: 0 12px; overflow: hidden; cursor: pointer;
  font-size: 19px; border: 0; border-radius: 0; box-shadow: none; backdrop-filter: none; background: #0f131b;
}
.pill.fill .ov, .pill.fill .vs { font-size: 13px; }
.pill.fill .dot { width: 9px; height: 9px; }
.pill.fill .chip { font-size: 11px; }
.pill.prompt { cursor: pointer; gap: 8px; color: #fff; background: #d92d20; border-color: #d92d20; animation: nudge 1.1s ease-in-out 4; }
.pill.prompt:hover { background: #b42318; }
.pill.prompt svg { width: 15px; height: 15px; }
@keyframes nudge { 50% { transform: scale(1.06); } }
.dot { width: 7px; height: 7px; border-radius: 50%; background: #667085; flex: none; }
.dot.live { background: #f04438; } /* steady, not blinking: it sits in view all match long */
.chip { font-size: 10px; font-weight: 800; letter-spacing: .05em; padding: 2px 7px; border-radius: 999px; color: #fff; animation: pulse .5s 6 alternate; }
.chip.k-W { background: #d92d20; } .chip.k-4 { background: #1570ef; } .chip.k-6 { background: #7a5af8; }
@keyframes pulse { 50% { opacity: .35; } }
@keyframes flash { 0% { opacity: 0; transform: scale(.92); } 8% { opacity: 1; transform: none; } 80% { opacity: 1; } 100% { opacity: 0; } }
`;

  const ICONS = {
    pop: '<path d="M9.5 2.5h4v4M13.5 2.5 8 8M12 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3"/>',
    collapse: '<path d="M3.5 8h9"/>',
    close: '<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>',
    refresh: '<path d="M13 8a5 5 0 1 1-1.6-3.7M13.2 2.5v2.8h-2.8"/>',
  };
  const TITLES = {
    pop: 'Float: a small window above all your windows, like a video',
    collapse: 'Show just the score',
    close: 'Hide (Alt+Shift+C brings it back)',
    refresh: 'Refresh now',
  };
  const EVENT_LABEL = { W: 'WICKET!', 6: 'SIX!', 4: 'FOUR!' };
  const ACTIONS = { float: ['pop', 'collapse', 'close'], pip: ['collapse', 'refresh'] };

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const shortOv = (info) => (String(info || '').match(/(\d+(?:\.\d)?)\s*ov/) || [])[1] || '';

  function ago(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 10) return 'just now';
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.round(s / 60)}m ago`;
    return `${Math.round(s / 3600)}h ago`;
  }

  function startsIn(iso, now) {
    const t = Date.parse(iso || '');
    if (!t) return '';
    const mins = Math.round((t - now) / 60000);
    if (mins <= 0) return 'Starting soon';
    if (mins < 60) return `Starts in ${mins}m`;
    if (mins < 24 * 60) return `Starts in ${Math.floor(mins / 60)}h ${mins % 60}m`;
    return 'Starts ' + new Date(t).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  }

  function badgeFor(s) {
    if (s.phase === 'live') {
      return s.status && s.status.toLowerCase() !== 'live' ? { cls: 'brk', text: s.status } : { cls: 'live', text: 'Live' };
    }
    if (s.phase === 'pre') return { cls: '', text: 'Upcoming' };
    return { cls: '', text: s.status || 'Result' };
  }

  function bar(badge, meta, mode) {
    const acts = (ACTIONS[mode] || [])
      .map((a) => `<button data-act="${a}" title="${TITLES[a]}"><svg viewBox="0 0 16 16">${ICONS[a]}</svg></button>`)
      .join('');
    return `<div class="bar${mode === 'float' ? ' drag' : ''}" data-drag>` +
      `<span class="badge ${badge.cls}">${esc(badge.text)}</span>` +
      `<span class="meta">${esc(meta)}</span><span class="acts">${acts}</span></div>`;
  }

  function teamRow(t, s) {
    const fallback = s.phase === 'live' ? 'Yet to bat' : s.phase === 'done' ? '–' : '';
    return `<div class="team${t.batting ? ' bat' : ''}"><i data-color="${esc(t.color || '')}"></i>` +
      `<b title="${esc(t.name)}">${esc(t.abbr)}</b>` +
      `<span class="sc${t.score ? '' : ' dim'}">${esc(t.score || fallback)}</span>` +
      `<span class="ov">${esc(t.info)}</span></div>`;
  }

  function card(s, opts, now) {
    const full = opts.mode === 'float' ? '' : opts.mode === 'inline' ? ' inline' : ' full';
    if (!s || !s.teams) {
      const body = s && s.error
        ? `Couldn't load the score.<small>${esc(s.error)}. If this keeps happening, open any cricinfo.com tab and the extension will read the score through it.</small>`
        : 'Loading score…';
      return `<div class="card${full}">${bar({ cls: '', text: 'Score' }, '', opts.mode)}<div class="msg">${body}</div></div>`;
    }
    const meta = [s.title, s.day && `Day ${s.day}`, s.ground].filter(Boolean).join(' · ');
    let html = bar(badgeFor(s), meta, opts.mode);
    html += `<div class="teams">${s.teams.map((t) => teamRow(t, s)).join('')}</div>`;

    const people = s.batters.map((b) =>
      `<div class="p${b.striker ? ' on' : ''}"><span class="n">${esc(b.name)}${b.striker ? ' <em>*</em>' : ''}</span>` +
      `<span class="v">${b.runs} <small>(${b.balls})</small></span></div>`
    );
    if (s.bowler) {
      const w = s.bowler;
      people.push(`<div class="p"><span class="n"><u>Bowl</u>${esc(w.name)}</span>` +
        `<span class="v">${w.wickets}-${w.runs} <small>(${w.overs})</small></span></div>`);
    }
    if (people.length) html += `<div class="sec">${people.join('')}</div>`;

    if (s.phase === 'live' && s.recent.length) {
      let lastOver = null;
      const balls = s.recent.map((b) => {
        const sep = lastOver !== null && b.o !== lastOver ? '<span class="sep"></span>' : '';
        lastOver = b.o;
        return `${sep}<span class="ball k-${esc(b.k)}">${esc(b.t)}</span>`;
      });
      html += `<div class="sec balls">${balls.join('')}</div>`;
    }

    const status = (s.phase === 'pre' && startsIn(s.startTime, now)) || s.statusText;
    const rates = [s.crr && `CRR ${s.crr.toFixed(2)}`, s.rrr && `RRR ${s.rrr.toFixed(2)}`].filter(Boolean).join(' · ');
    const updated = s.error
      ? `<span class="upd err" title="${esc(s.error)}">⚠ ${ago(now - (s.fetchedAt || now))}</span>`
      : `<span class="upd">${ago(now - (s.boostedAt || s.fetchedAt || now))}</span>`;
    html += `<div class="sec foot">${status ? `<div class="st">${esc(status)}</div>` : ''}` +
      `<div class="fm"><span>${rates}</span>${updated}</div></div>`;
    if (opts.flash) html += `<div class="flash k-${esc(opts.flash)}">${EVENT_LABEL[opts.flash] || ''}</div>`;
    return `<div class="card${full}">${html}</div>`;
  }

  // The one-line score: a draggable pill on pages, or the whole floating window when score-only.
  function pill(s, opts, now) {
    const fill = opts.mode === 'pip';
    const open = `<div class="pill${fill ? ' fill' : ''}"${fill ? '' : ' data-drag'} data-act="expand" ` +
      `title="${fill ? 'Click for details' : 'Click to expand, drag to move'}">`;
    const pop = opts.mode === 'float' ? `<button data-act="pop" title="${TITLES.pop}"><svg viewBox="0 0 16 16">${ICONS.pop}</svg></button>` : '';
    if (!s || !s.teams) {
      return `${open}<span class="dot"></span>${s && s.error ? 'Score unavailable' : 'Loading…'}${pop}</div>`;
    }
    const bat = s.teams.find((t) => t.batting);
    let body;
    if (bat) {
      const opp = s.teams.find((t) => t !== bat);
      const ov = shortOv(bat.info);
      body = `<b>${esc(bat.abbr)}</b><span class="sc">${esc(bat.score || '0/0')}</span>` +
        (ov ? `<span class="ov">(${esc(ov)})</span>` : '') + (opp ? `<span class="vs">v ${esc(opp.abbr)}</span>` : '');
    } else if (s.phase === 'pre') {
      body = `<b>${esc(s.teams[0].abbr)}</b><span class="vs">v</span><b>${esc(s.teams[1] ? s.teams[1].abbr : '')}</b>` +
        `<span class="ov">${esc(startsIn(s.startTime, now))}</span>`;
    } else {
      body = s.teams.map((t) => `<b>${esc(t.abbr)}</b><span class="sc">${esc(t.score || '–')}</span>`).join('<span class="vs">v</span>');
    }
    const chip = opts.flash ? `<span class="chip k-${esc(opts.flash)}">${EVENT_LABEL[opts.flash] || ''}</span>` : '';
    return `${open}<span class="dot${s.phase === 'live' ? ' live' : ''}"></span>${body}${chip}${pop}</div>`;
  }

  // Shown on the page when the browser wants a click on the page itself before floating.
  function floatPrompt() {
    return `<div class="pill prompt" data-act="pop" title="${TITLES.pop}"><svg viewBox="0 0 16 16">${ICONS.pop}</svg>Click to float the score</div>`;
  }

  // opts: { mode: 'float' | 'pip' | 'inline', collapsed, prompt, flash: 'W' | '4' | '6' | null, now }
  function render(box, score, opts = {}) {
    const now = opts.now || Date.now();
    if (opts.prompt) box.innerHTML = floatPrompt();
    else box.innerHTML = opts.collapsed && opts.mode !== 'inline' ? pill(score, opts, now) : card(score, opts, now);
    // Colours go through CSSOM rather than style="" so strict page CSPs can't block them.
    box.querySelectorAll('[data-color]').forEach((el) => {
      if (/^#[0-9a-f]{3,8}$/i.test(el.dataset.color)) el.style.background = el.dataset.color;
    });
  }

  // Constructable stylesheets also sidestep page CSPs that forbid inline <style>.
  function adoptStyles(target, win = root) {
    const sheet = new win.CSSStyleSheet();
    sheet.replaceSync(CSS);
    target.adoptedStyleSheets = [sheet];
  }

  root.CricWidget = { render, adoptStyles, EVENT_LABEL };
})(typeof self !== 'undefined' ? self : globalThis);

// Shows the floating score on every page. The score itself comes from chrome.storage,
// which background.js keeps up to date; this script only draws it and reports drags/clicks.
(() => {
  const TAG = 'cric-float-score';
  const TAKEOVER = 'cric-float-takeover';

  // After an extension reload the previous copy of this script is orphaned: tell it to clean up.
  document.dispatchEvent(new CustomEvent(TAKEOVER));
  document.querySelectorAll(TAG).forEach((n) => n.remove());

  const W = window.CricWidget;
  const timers = [];
  let alive = true;
  let prefs = null;
  let score = null;
  let host = null;
  let box = null;
  let drag = null;
  let renderPending = false;
  let dragEndedAt = -Infinity;
  let flash = null;
  let flashUntil = 0;
  let shownEvent = null;
  let lastTitle = '';

  function stop() {
    alive = false;
    timers.forEach(clearInterval);
    if (host) host.remove();
    host = null;
  }
  document.addEventListener(TAKEOVER, stop, { once: true });

  const extensionGone = () => !(globalThis.chrome && chrome.runtime && chrome.runtime.id);

  function send(msg) {
    if (!alive) return;
    if (extensionGone()) return stop();
    try {
      chrome.runtime.sendMessage(msg).catch(() => {});
    } catch (_) {
      stop();
    }
  }

  async function savePrefs(patch) {
    prefs = { ...prefs, ...patch };
    render();
    try {
      const { prefs: current } = await chrome.storage.local.get('prefs');
      await chrome.storage.local.set({ prefs: { ...current, ...patch } });
    } catch (_) {
      stop();
    }
  }

  function setStyles(el, styles) {
    for (const [k, v] of Object.entries(styles)) el.style.setProperty(k, v, 'important');
  }

  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  const viewW = () => document.documentElement.clientWidth || innerWidth;
  const viewH = () => document.documentElement.clientHeight || innerHeight;

  function ensureHost() {
    if (host && host.isConnected) return;
    host = document.createElement(TAG);
    const shadow = host.attachShadow({ mode: 'closed' });
    W.adoptStyles(shadow);
    box = document.createElement('div');
    shadow.append(box);
    setStyles(host, {
      position: 'fixed', inset: 'auto', margin: '0', padding: '0', border: '0', 'z-index': '2147483647',
      display: 'block', width: 'auto', height: 'auto', 'max-width': 'none', 'max-height': 'none',
      background: 'transparent', overflow: 'visible', 'pointer-events': 'auto', transform: 'none',
    });
    box.addEventListener('pointerdown', onPointerDown);
    box.addEventListener('click', onClick);
    // A manual popover lives in the browser's top layer, above any z-index the page uses.
    if (host.showPopover) host.setAttribute('popover', 'manual');
    document.documentElement.append(host);
    raise();
  }

  function raise() {
    if (!host || !host.showPopover) return;
    try {
      if (host.matches(':popover-open')) host.hidePopover();
      host.showPopover();
    } catch (_) {
      // not supported here; the z-index still applies
    }
  }

  // pos = { h: 'left' | 'right', x, v: 'top' | 'bottom', y }: the distance from the nearest
  // edges, so the card grows away from the corner it sits in when it is expanded.
  const DEFAULT_POS = { h: 'right', x: 18, v: 'bottom', y: 18 };

  function place() {
    if (!host) return;
    const pos = prefs && prefs.pos && prefs.pos.h ? prefs.pos : DEFAULT_POS;
    const r = host.getBoundingClientRect();
    const x = clamp(pos.x, 0, viewW() - r.width) + 'px';
    const y = clamp(pos.y, 0, viewH() - r.height) + 'px';
    setStyles(host, {
      left: pos.h === 'left' ? x : 'auto',
      right: pos.h === 'left' ? 'auto' : x,
      top: pos.v === 'top' ? y : 'auto',
      bottom: pos.v === 'top' ? 'auto' : y,
    });
  }

  function activeFlash(now) {
    return flash && now < flashUntil ? flash : null;
  }

  function checkEvent() {
    const ev = score && score.event;
    if (!ev || ev.id === shownEvent) return;
    shownEvent = ev.id;
    if (Date.now() - ev.at > 60000 || document.visibilityState !== 'visible') return;
    flash = ev.kind;
    flashUntil = Date.now() + 3900;
    setTimeout(render, 4000);
  }

  function render() {
    if (!alive || !prefs) return;
    if (drag) {
      renderPending = true;
      return;
    }
    const now = Date.now();
    if (!prefs.enabled || !prefs.matchUrl) {
      if (host) host.remove();
      host = null;
      return;
    }
    ensureHost();
    W.render(box, score, { collapsed: prefs.collapsed, flash: activeFlash(now), now });
    place();
  }

  // --- Dragging --------------------------------------------------------------

  function onPointerDown(e) {
    e.stopPropagation();
    if (e.button !== 0 || e.target.closest('button') || !e.target.closest('[data-drag]')) return;
    const r = host.getBoundingClientRect();
    drag = { x: e.clientX, y: e.clientY, startLeft: r.left, startTop: r.top, left: r.left, top: r.top, w: r.width, h: r.height, moved: false };
    // Listen on the window: a quick flick can leave the pill before the first move event.
    addEventListener('pointermove', onPointerMove, true);
    addEventListener('pointerup', onPointerUp, true);
    addEventListener('pointercancel', onPointerUp, true);
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!drag) return;
    if (e.buttons === 0) return onPointerUp(); // the release happened somewhere we didn't see
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved) {
      if (Math.abs(dx) + Math.abs(dy) < 4) return;
      // Capture only once it is really a drag, so a plain click still lands on the pill.
      drag.moved = true;
      try {
        box.setPointerCapture(e.pointerId);
      } catch (_) {
        // pointer already released
      }
    }
    drag.left = Math.round(clamp(drag.startLeft + dx, 0, viewW() - drag.w));
    drag.top = Math.round(clamp(drag.startTop + dy, 0, viewH() - drag.h));
    setStyles(host, { left: drag.left + 'px', top: drag.top + 'px', right: 'auto', bottom: 'auto' });
  }

  function anchoredPos({ left, top, w, h }) {
    const vw = viewW();
    const vh = viewH();
    const h1 = left + w / 2 < vw / 2 ? 'left' : 'right';
    const v1 = top + h / 2 < vh / 2 ? 'top' : 'bottom';
    return {
      h: h1,
      x: Math.round(h1 === 'left' ? left : vw - left - w),
      v: v1,
      y: Math.round(v1 === 'top' ? top : vh - top - h),
    };
  }

  function onPointerUp(e) {
    removeEventListener('pointermove', onPointerMove, true);
    removeEventListener('pointerup', onPointerUp, true);
    removeEventListener('pointercancel', onPointerUp, true);
    const done = drag;
    drag = null;
    if (done && done.moved) {
      dragEndedAt = e ? e.timeStamp : performance.now(); // the click that ends a drag is not a click
      savePrefs({ pos: anchoredPos(done) });
    } else if (renderPending) {
      renderPending = false;
      render();
    }
  }

  // --- Buttons ---------------------------------------------------------------

  function onClick(e) {
    e.stopPropagation();
    if (e.timeStamp - dragEndedAt < 50) return;
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    if (act === 'collapse') savePrefs({ collapsed: true });
    else if (act === 'expand') savePrefs({ collapsed: false });
    else if (act === 'close') savePrefs({ enabled: false });
    else if (act === 'refresh') send({ type: 'refresh' });
  }

  // --- Fresher numbers from an open Cricinfo match tab --------------------------

  function reportTitle() {
    const onMatchPage = /(^|\.)cricinfo\.com$/.test(location.hostname) && /^\/series\/[^/]+\/[^/]+/.test(location.pathname);
    if (!onMatchPage || document.title === lastTitle) return;
    lastTitle = document.title;
    send({ type: 'title', url: location.href, title: document.title });
  }

  // --- Start -----------------------------------------------------------------

  function tick() {
    if (!alive) return;
    if (extensionGone()) return stop();
    if (prefs && prefs.matchUrl && prefs.enabled && document.visibilityState === 'visible') send({ type: 'tick' });
  }

  chrome.storage.local.get(['prefs', 'score']).then((r) => {
    prefs = r.prefs || null;
    score = r.score || null;
    shownEvent = score && score.event ? score.event.id : null; // don't replay an old wicket
    render();
    tick();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (!alive || area !== 'local') return;
    if (changes.prefs) prefs = changes.prefs.newValue || null;
    if (changes.score) {
      score = changes.score.newValue || null;
      checkEvent();
    }
    render();
  });

  document.addEventListener('visibilitychange', () => {
    tick();
    render();
  });
  document.addEventListener('fullscreenchange', raise);
  addEventListener('resize', place);
  timers.push(setInterval(tick, 5000));
  timers.push(setInterval(() => {
    if (document.visibilityState === 'visible') render(); // keeps "updated 20s ago" honest
  }, 15000));

  if (/(^|\.)cricinfo\.com$/.test(location.hostname)) {
    new MutationObserver(reportTitle).observe(document.head || document.documentElement, { subtree: true, childList: true, characterData: true });
    reportTitle();
  }
})();

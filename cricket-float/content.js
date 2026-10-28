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
  let pip = null; // { win, box } while this tab hosts the floating window
  let floating = null; // { tabId, at } while any tab hosts it (background.js keeps this)
  let promptUntil = 0; // showing "Click to float the score" until then
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
    if (pip) pip.win.close();
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
    if (Date.now() - ev.at > 60000 || (document.visibilityState !== 'visible' && !pip)) return;
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
    // While the score floats in its own window, the cards inside pages step aside.
    const floatingSomewhere = !!pip || (!!floating && now - floating.at < FLOATING_TTL);
    const prompt = !pip && now < promptUntil;
    const show = prompt || (prefs.enabled && prefs.matchUrl && !floatingSomewhere);
    if (!show) {
      if (host) host.remove();
      host = null;
    } else {
      ensureHost();
      W.render(box, score, { mode: 'float', collapsed: prefs.collapsed, prompt, flash: activeFlash(now), now });
      place();
    }
    if (pip) W.render(pip.box, score, { mode: 'pip', collapsed: prefs.pipCompact !== false, flash: activeFlash(now), now });
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
    if (pip && e.currentTarget === pip.box) {
      if (act === 'collapse' || act === 'expand') setFloatLayout(act === 'collapse');
      else if (act === 'refresh') send({ type: 'refresh' });
      return;
    }
    if (act === 'collapse') savePrefs({ collapsed: true });
    else if (act === 'expand') savePrefs({ collapsed: false });
    else if (act === 'close') savePrefs({ enabled: false });
    else if (act === 'pop') popOut();
    else if (act === 'refresh') send({ type: 'refresh' });
  }

  // --- The floating window -------------------------------------------------------
  // Document Picture-in-Picture: the same kind of always-on-top corner window Chrome
  // uses for videos. Score-only by default; click it for the full card.

  const COMPACT_SIZE = { width: 280, height: 64 };
  const FLOATING_TTL = 150000; // trust another tab's "I'm floating" for this long without a heartbeat

  function contentHeight(el) {
    const card = el && el.firstElementChild;
    if (!card || !card.classList.contains('card')) return 262;
    const used = [...card.children].filter((c) => !c.classList.contains('flash')).reduce((h, c) => h + c.offsetHeight, 0);
    return used + 2 + 16; // border, plus spare room for a two-line status or a browser info bar
  }

  function setFloatLayout(compact) {
    savePrefs({ pipCompact: compact }); // re-renders the window straight away
    const w = compact ? COMPACT_SIZE.width : 300;
    const h = compact ? COMPACT_SIZE.height : contentHeight(pip.box);
    try {
      pip.win.resizeBy(w - pip.win.innerWidth, h - pip.win.innerHeight);
    } catch (_) {
      // the user can still resize it by hand
    }
  }

  // Resolves to 'ok', 'unsupported', 'not-allowed' (no click to justify it) or an error message.
  async function popOut() {
    if (pip) return 'ok';
    const api = window.documentPictureInPicture;
    if (!api) return 'unsupported';
    const compact = prefs.pipCompact !== false;
    const size = compact ? COMPACT_SIZE : { width: 300, height: host && !prefs.collapsed ? contentHeight(box) : 262 };
    let win;
    try {
      win = await api.requestWindow(size);
    } catch (err) {
      return err && err.name === 'NotAllowedError' ? 'not-allowed' : String((err && err.message) || err);
    }
    W.adoptStyles(win.document, win);
    win.document.title = 'Live score';
    setStyles(win.document.body, { margin: '0', background: '#0f131b' });
    const pbox = win.document.createElement('div');
    win.document.body.append(pbox);
    pbox.addEventListener('click', onClick);
    pip = { win, box: pbox };
    promptUntil = 0;
    win.addEventListener('pagehide', () => {
      pip = null;
      send({ type: 'floating', open: false });
      render();
    });
    render();
    send({ type: 'floating', open: true });
    send({ type: 'tick', pip: true });
    return 'ok';
  }

  // What the toolbar menu calls (through chrome.scripting) to float or un-float the score.
  globalThis.cricFloatApi = {
    async pop(promptIfBlocked = true) {
      const result = await popOut();
      if (result === 'not-allowed' && promptIfBlocked) {
        // The menu's click didn't count for this page: ask for one click on the page instead.
        promptUntil = Date.now() + 20000;
        render();
        setTimeout(render, 20100);
      }
      return result;
    },
    unpop() {
      if (pip) pip.win.close();
      return 'ok';
    },
  };

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
    if (prefs && prefs.matchUrl && (pip || (prefs.enabled && document.visibilityState === 'visible'))) send({ type: 'tick', pip: !!pip });
  }

  chrome.storage.local.get(['prefs', 'score', 'floating']).then((r) => {
    prefs = r.prefs || null;
    score = r.score || null;
    floating = r.floating || null;
    shownEvent = score && score.event ? score.event.id : null; // don't replay an old wicket
    render();
    tick();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (!alive || area !== 'local') return;
    if (changes.prefs) prefs = changes.prefs.newValue || null;
    if (changes.floating) floating = changes.floating.newValue || null;
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
    if (document.visibilityState === 'visible' || pip) render(); // keeps "updated 20s ago" honest
  }, 15000));

  if (/(^|\.)cricinfo\.com$/.test(location.hostname)) {
    new MutationObserver(reportTitle).observe(document.head || document.documentElement, { subtree: true, childList: true, characterData: true });
    reportTitle();
  }
})();

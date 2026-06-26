/* ============================================================================
   AnimFrame — First-run onboarding (SELF-CONTAINED, OPTIONAL MODULE)
   ----------------------------------------------------------------------------
   To remove onboarding entirely, delete these three things — nothing else:
     1. this file (onboarding.js)
     2. onboarding.css
     3. the two <link>/<script> tags for them in index.html
   No changes to main.js or any other file are required.

   How it stays decoupled:
     - It only READS from the app (localStorage, the onion button's state, the
       existing #mainSvg / #addFrameBtn / #playBtn elements).
     - It hooks behaviour by adding its OWN listeners to those existing elements;
       it never asks main.js to call it, and main.js has no reference to it.
     - All injected DOM is namespaced .afob-* and appended under one root node.
     - If any expected element is missing, it fails safe and does nothing.

   User-facing off switch: the opt-in card's "I'll explore" button, and it only
   ever appears on a genuine first run (no saved drawing + not seen before).
   It can be re-run anytime from File ▸ Quick start (injected by this module).
   ============================================================================ */
(function () {
  'use strict';
  if (window.__afOnboardingLoaded) return;
  window.__afOnboardingLoaded = true;

  var FLAG = 'animframe-onboarded';            // our own "already seen" flag
  var PROJECT_KEY = 'vectorAnimationToolData'; // app's localStorage key (read-only)

  // ---- tiny helpers ----
  function $(id) { return document.getElementById(id); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function seen() { return lsGet(FLAG) === '1'; }
  function markSeen() { lsSet(FLAG, '1'); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  // Treat the project as "existing work" only if it contains at least one drawn path.
  function hasExistingWork() {
    var d = lsGet(PROJECT_KEY);
    if (!d) return false;
    return /"paths"\s*:\s*\[\s*\{/.test(d);
  }

  // ---- injected DOM ----
  var root, overlay, prompt, nudge, nudgeMsg, nudgeSkip, doneFlash;
  var step = 'idle';

  function buildDom() {
    root = el('div', 'afob-root');

    overlay = el('div', 'afob-overlay');
    var card = el('div', 'afob-card');
    card.innerHTML =
      '<div class="afob-cmark"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5l12 7-12 7z"/></svg></div>' +
      '<h3 class="afob-h3">Make your first animation?</h3>' +
      '<p class="afob-p">A quick guided start \u2014 draw, add a frame, draw again, and watch it move. About 30 seconds.</p>' +
      '<div class="afob-actions">' +
        '<button class="afob-primary" id="afob-start">Show me how</button>' +
        '<button class="afob-secondary" id="afob-explore">I\u2019ll explore on my own</button>' +
      '</div>';
    overlay.appendChild(card);

    prompt = el('div', 'afob-prompt',
      '<div class="afob-ring"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7-4-4-7 7-1 5z"/><path d="M16 6l2-2"/></svg></div><span>Draw here</span>');

    nudge = el('div', 'afob-nudge',
      '<span class="afob-dot"></span><span class="afob-msg"></span><span class="afob-skip">Skip</span><span class="afob-arrow"></span>');
    nudgeMsg = nudge.querySelector('.afob-msg');
    nudgeSkip = nudge.querySelector('.afob-skip');

    doneFlash = el('div', 'afob-done', '<span class="afob-dot"></span>You\u2019re animating');

    root.appendChild(overlay);
    root.appendChild(prompt);
    root.appendChild(nudge);
    root.appendChild(doneFlash);
    document.body.appendChild(root);

    $('afob-start').addEventListener('click', function () { markSeen(); hideOverlay(); startGuided(); });
    $('afob-explore').addEventListener('click', function () { markSeen(); hideOverlay(); endFlow(); });
    nudgeSkip.addEventListener('click', endFlow);
  }

  // ---- show/hide ----
  function hideOverlay() { overlay.classList.remove('afob-show'); }
  function showPrompt() { positionPrompt(); prompt.classList.add('afob-show'); }
  function hidePrompt() { prompt.classList.remove('afob-show'); }
  function hideNudge() { nudge.classList.remove('afob-show'); }

  function positionPrompt() {
    var svg = $('mainSvg'); if (!svg) return;
    var r = svg.getBoundingClientRect();
    prompt.style.left = (r.left + r.width / 2) + 'px';
    prompt.style.top = (r.top + r.height / 2) + 'px';
  }

  function placeNudge(target, text, withSkip) {
    if (!target) { hideNudge(); return; }
    nudgeMsg.textContent = text;
    nudgeSkip.style.display = withSkip ? '' : 'none';
    nudge.classList.add('afob-show');
    var r = target.getBoundingClientRect();
    var nw = nudge.offsetWidth, nh = nudge.offsetHeight;
    var left = r.left + r.width / 2 - nw / 2;
    var top = r.top - nh - 12;                       // always above the target (never clipped)
    left = Math.max(8, Math.min(left, window.innerWidth - nw - 8));
    top = Math.max(8, top);
    nudge.style.left = left + 'px';
    nudge.style.top = top + 'px';
  }

  // ---- onion staging (read app's own flag via the button's synced .active class) ----
  function ensureOnionOn() {
    var b = $('onionSkinToggle');
    if (b && !b.classList.contains('active')) { try { b.click(); } catch (e) {} }
  }

  // ---- flow ----
  function startGuided() {
    step = 'draw1';
    ensureOnionOn();
    showPrompt();
    // subsequent steps are driven by real app events (see wire())
  }
  function endFlow() { step = 'done'; hideNudge(); hidePrompt(); }
  function celebrate() {
    hideNudge(); hidePrompt();
    var svg = $('mainSvg');
    if (svg) {
      var r = svg.getBoundingClientRect();
      doneFlash.style.left = (r.left + r.width / 2) + 'px';
      doneFlash.style.top = (r.top + 16) + 'px';
    }
    doneFlash.classList.add('afob-show');
    setTimeout(function () { doneFlash.classList.remove('afob-show'); }, 2400);
    step = 'done';
  }

  // ---- reactions to existing app events ----
  function onSvgPointerUp() {
    if (step === 'draw1') { hidePrompt(); step = 'add'; placeNudge($('addFrameBtn'), 'Add a frame', true); }
    else if (step === 'draw2') { step = 'play'; placeNudge($('playBtn'), 'Press play', false); }
  }
  function onAddFrame() {
    if (step === 'add') { step = 'draw2'; placeNudge($('mainSvg'), 'Draw again', false); }
  }
  function onPlay() {
    if (step === 'play') { celebrate(); }
  }

  function wire() {
    var svg = $('mainSvg'); if (svg) svg.addEventListener('pointerup', onSvgPointerUp);
    var add = $('addFrameBtn'); if (add) add.addEventListener('click', onAddFrame);
    var play = $('playBtn'); if (play) play.addEventListener('click', onPlay);
    window.addEventListener('resize', function () {
      if (prompt.classList.contains('afob-show')) positionPrompt();
    });
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (overlay.classList.contains('afob-show')) { markSeen(); hideOverlay(); }
        endFlow();
      }
    });
  }

  // ---- "Quick start" entry in the File menu (injected, so it's removed with this file) ----
  function injectMenuItem() {
    var menu = $('fileMenu'); if (!menu || $('afob-quickstart')) return;
    menu.appendChild(el('div', 'file-divider'));
    var btn = el('button', 'file-option'); btn.id = 'afob-quickstart'; btn.textContent = 'Quick start';
    btn.addEventListener('click', function () {
      menu.style.display = 'none';      // close the menu the same way the app does
      hideOverlay();
      startGuided();
    });
    menu.appendChild(btn);
  }

  // ---- init ----
  function init() {
    if (!$('mainSvg')) return;           // fail safe: app not present as expected
    buildDom();
    wire();
    injectMenuItem();
    if (!seen()) {
      if (hasExistingWork()) { markSeen(); }      // returning user: never interrupt their work
      else { overlay.classList.add('afob-show'); } // genuine first run: ask
    }
  }

  if (document.readyState === 'complete') { setTimeout(init, 300); }
  else { window.addEventListener('load', function () { setTimeout(init, 300); }); }
})();

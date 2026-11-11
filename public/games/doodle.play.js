/* «Каракули» — экран телефона */
(function () {
  'use strict';
  var t = U.t, esc = U.esc;
  var $ = function (id) { return document.getElementById(id); };
  var P = null, G = null, el = null, ctx = null, key = null;
  var pad = null, padKey = null, tool = { c: 0, w: 0, e: false }, draft = '';

  function msg(emoji, title, sub) {
    return '<div class="card big-msg"><div class="emoji">' + emoji + '</div><h2>' + esc(title) + '</h2>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>';
  }
  function set(k, html, after) { if (k === key) return; key = k; el.innerHTML = html; if (after) after(); }
  function destroyPad() { if (pad) { pad.destroy(); pad = null; window.removeEventListener('resize', fit); } padKey = null; }
  function fit() {
    var w = $('ddWrap'), b = $('ddBox'); if (!w || !b) return;
    var s = Math.floor(Math.min(w.clientWidth, w.clientHeight)); b.style.width = b.style.height = s + 'px'; if (pad) pad.board.resize();
  }

  function render(p, root, c) {
    P = p; G = p.game; ctx = c;
    if (el !== root) { el = root; key = null; }
    var lang = i18n.getLang(), ph = G.phase, cur = G.cur;
    if (G.spectator) { destroyPad(); return set('spec', msg('👀', t('play.spectator'))); }
    if (ph === 'draw' && !G.done) return renderDraw(lang);
    destroyPad();
    if (ph === 'draw') return set('dw' + lang, msg('🖼️', t('doodle.doneWait'), t('play.watch')));
    if (G.isArtist) return set('art' + ph + lang, msg('🤫', t('doodle.yourDrawing'), t('doodle.yourDrawingSub', { p: G.myPhrase })) +
      (ph === 'reveal' ? '<div class="card big-msg"><h2>' + esc(G.delta ? t('doodle.plus', { n: G.delta }) : t('doodle.zero')) + '</h2></div>' : ''));
    if (ph === 'lie') {
      if (G.myLie) return set('lied' + G.myLie + lang, msg('🤥', t('doodle.lieSent', { t: G.myLie }), t('play.watch')));
      var inp = $('ddIn'); if (inp) draft = inp.value;
      return set('lie:' + cur.artist + G.round + lang, '<div class="card"><h2>🤔 ' + esc(t('doodle.lieTv')) + '</h2><p>' + esc(t('doodle.lieHint')) + '</p>' +
        '<input class="t" id="ddIn" maxlength="40" autocomplete="off" placeholder="' + esc(t('doodle.liePh')) + '">' +
        '<button class="btn" id="ddGo">' + esc(t('doodle.lieSend')) + '</button></div>', function () {
        var i = $('ddIn'); i.value = draft;
        var go = function () { var v = i.value.trim(); if (v) { ctx.act('lie', { text: v }); draft = ''; } };
        $('ddGo').onclick = go; i.onkeydown = function (e) { if (e.key === 'Enter') go(); };
      });
    }
    if (ph === 'vote') {
      return set('vote:' + cur.artist + G.myVote + lang, '<div class="card"><h2>🗳️ ' + esc(t('doodle.voteHint')) + '</h2></div><div class="cr-vlist">' +
        cur.options.map(function (o) {
          var mine = (G.myOptions || []).indexOf(o.i) >= 0;
          return '<button class="vote-btn' + (G.myVote === o.i ? ' sel' : '') + '" data-i="' + o.i + '"' + (mine ? ' disabled' : '') + '><span>' + esc(o.text) +
            (mine ? '<small>' + esc(t('doodle.yours')) + '</small>' : '') + '</span></button>';
        }).join('') + '</div>', function () {
        el.querySelectorAll('[data-i]').forEach(function (b) { b.onclick = function () { ctx.act('vote', { i: +b.dataset.i }); }; });
      });
    }
    set('rev' + cur.artist + G.left + lang, msg(G.delta ? '🎉' : '😅', G.delta ? t('doodle.plus', { n: G.delta }) : t('doodle.zero'), t('play.watch')));
  }

  function renderDraw(lang) {
    var pk = G.round + ':' + G.phrase + ':' + lang;
    if (padKey === pk && pad) {
      var sw = $('ddSwap'); if (sw) sw.disabled = !G.canSwap;
      return;
    }
    destroyPad(); padKey = pk; key = 'draw';
    tool = { c: 0, w: 0, e: false };
    el.innerHTML = '<div class="fill-screen cr-phone"><div class="cr-pword">' + esc(t('doodle.yourPhrase')) + ' <b>' + esc(G.phrase) + '</b></div>' +
      '<div class="cr-pad-wrap" id="ddWrap"><div class="cr-pad-box" id="ddBox"><canvas id="ddPad"></canvas></div></div>' +
      '<div class="cr-tools">' + CANVAS.COLORS.map(function (col, i) { return '<button class="cr-col' + (i ? '' : ' sel') + '" data-c="' + i + '" style="background:' + col + '"></button>'; }).join('') +
      '<button class="cr-tool sel" data-w="0">●</button><button class="cr-tool" data-w="1">⬤</button><button class="cr-tool" data-e="1">🧽</button>' +
      '<button class="cr-tool" id="ddUndo">↶</button><button class="cr-tool" id="ddClear">🗑</button></div>' +
      '<div class="host-row"><button class="btn sec" id="ddSwap"' + (G.canSwap ? '' : ' disabled') + '>' + esc(t('doodle.swap')) + '</button>' +
      '<button class="btn" id="ddDone">' + esc(t('doodle.done')) + '</button></div></div>';
    fit();
    pad = new CANVAS.Pad($('ddPad'), { send: function (ops) { ctx.act('draw', { ops: ops }); }, tool: function () { return tool; } });
    var sel = function () {
      el.querySelectorAll('[data-c]').forEach(function (b) { b.classList.toggle('sel', !tool.e && +b.dataset.c === tool.c); });
      el.querySelectorAll('[data-w]').forEach(function (b) { b.classList.toggle('sel', !tool.e && +b.dataset.w === tool.w); });
      el.querySelector('[data-e]').classList.toggle('sel', tool.e);
    };
    el.querySelectorAll('[data-c]').forEach(function (b) { b.onclick = function () { tool = { c: +b.dataset.c, w: tool.w, e: false }; sel(); }; });
    el.querySelectorAll('[data-w]').forEach(function (b) { b.onclick = function () { tool = { c: tool.c, w: +b.dataset.w, e: false }; sel(); }; });
    el.querySelector('[data-e]').onclick = function () { tool = { c: tool.c, w: tool.w, e: !tool.e }; sel(); };
    $('ddUndo').onclick = function () { pad.undo(); };
    $('ddClear').onclick = function () { pad.clear(); };
    $('ddSwap').onclick = function () { ctx.act('swap'); };
    $('ddDone').onclick = function () { pad.flush(); ctx.act('done'); };
    window.addEventListener('resize', fit);
  }

  function onEvent(ev, d) { if (ev === 'full' && pad) pad.board.reset(d.strokes); }
  function unmount() { destroyPad(); key = null; P = G = null; el = null; draft = ''; }
  window.GAMES = window.GAMES || {};
  (window.GAMES.doodle = window.GAMES.doodle || {}).play = { render: render, unmount: unmount, onEvent: onEvent,
    hideReactions: function (p) { return p.game && p.game.phase === 'draw' && !p.game.done; } };
})();

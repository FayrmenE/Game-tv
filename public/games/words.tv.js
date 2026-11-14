/* «Объясни!» и «Шляпа» — экран ТВ */
(function () {
  'use strict';
  var t = U.t, esc = U.esc;
  var $ = function (id) { return document.getElementById(id); };
  var P = null, G = null, layout = null, board = null, pending = null, ro = null, lastGuessed = 0, stageKey = null;
  var MODE_ICON = { explain: '🗣️', oneword: '☝️', gestures: '🤸', draw: '🎨' };

  function pl(id) { return U.playerById(P, id) || { name: '?', color: '#888' }; }
  function teamName(i) { return t('words.team.' + i); }
  function tcol(i) { return (G.colors || [])[i] || '#888'; }

  function mount() {
    layout = 'w' + i18n.getLang();
    if (board) { board.destroy(); board = null; }
    $('main').innerHTML = '<div class="wd-tv"><div class="wd-teams" id="wdTeams"></div><div class="wd-stage" id="wdStage"></div></div>';
    $('strip').innerHTML = '';
    $('strip').classList.add('hidden');
    stageKey = null;
  }

  function render(p) {
    P = p; G = p.game;
    if (layout !== 'w' + i18n.getLang()) mount();
    var ph = G.phase, hat = G.mode === 'hat';
    var title = ph === 'teams' ? t('words.ph.teams') : ph === 'round' ? t('words.ph.round', { n: G.round, m: G.rounds }) :
      ph === 'final' ? t('words.ph.final') : G.explainer ? t('words.ph.turn', { name: pl(G.explainer).name }) : '';
    $('phaseTitle').textContent = title;
    $('phaseSub').textContent = hat ? t('words.hatSub', { n: G.round || 1, m: G.rounds, mode: t('words.mode.' + G.roundMode) }) +
      (G.poolLeft != null && ph !== 'teams' ? ' · ' + t('words.inHat', { n: G.poolLeft }) : '')
      : t('words.aliasSub', { n: G.target }) + (G.penalty ? ' · ' + t('words.penaltyOn') : '');
    teamsPanel();
    stage();
  }

  function teamsPanel() {
    var max = Math.max(1, G.mode === 'alias' ? G.target : Math.max.apply(null, (G.scores || [0]).concat([1])));
    $('wdTeams').innerHTML = G.teams.map(function (ids, i) {
      var sc = (G.scores || [])[i] || 0, active = G.team === i && G.phase !== 'teams' && G.phase !== 'final' && G.phase !== 'round';
      return '<div class="wd-team' + (active ? ' active' : '') + '" style="--c:' + tcol(i) + '"><div class="wd-th"><b>' + esc(teamName(i)) + '</b>' +
        (G.phase === 'teams' ? '' : '<span class="wd-sc">' + sc + '</span>') + '</div>' +
        (G.phase === 'teams' ? '' : '<div class="wd-bar"><i style="width:' + Math.min(100, 100 * sc / max).toFixed(1) + '%"></i>' + (G.mode === 'alias' ? '<em>🏁</em>' : '') + '</div>') +
        '<div class="wd-mem">' + ids.map(function (id) {
          return '<span class="' + (id === G.explainer && active ? 'exp' : '') + '">' + U.avatar(pl(id)) + esc(pl(id).name) + '</span>';
        }).join('') + '</div></div>';
    }).join('');
  }

  function setStage(k, html) { if (stageKey === k) return false; stageKey = k; $('wdStage').innerHTML = html; return true; }

  function stage() {
    var ph = G.phase, k = ph + ':' + G.round + ':' + (G.explainer || '') + ':' + (G.scores || []).join(',');
    if (ph !== 'turn' && board) { board.destroy(); board = null; if (ro) ro.disconnect(); }
    if (ph === 'teams') {
      return setStage('teams' + G.teams.map(function (x) { return x.join(','); }).join('|'), '<div class="wd-big">👥 ' + esc(t('words.tv.teams')) + '</div>' +
        '<div class="wd-sub">' + esc(t('words.tv.teamsSub')) + '</div>');
    }
    if (ph === 'round') {
      return setStage(k, '<div class="wd-round"><div class="wd-ricon">' + MODE_ICON[G.roundMode] + '</div><h2>' + esc(t('words.ph.round', { n: G.round, m: G.rounds })) + ': ' +
        esc(t('words.mode.' + G.roundMode)) + '</h2><p>' + esc(t('words.mode.' + G.roundMode + '.d')) + '</p>' +
        (G.round > 1 ? '<p class="wd-sub">' + esc(t(G.sameWords ? 'words.tv.sameWords' : 'words.tv.newWords', { n: G.perRound })) + '</p>' : '<p class="wd-sub">' + esc(t('words.tv.newWords', { n: G.perRound })) + '</p>') + '</div>');
    }
    if (ph === 'ready') {
      return setStage(k, '<div class="wd-ready" style="--c:' + tcol(G.team) + '">' + U.avatar(pl(G.explainer), 'big') +
        '<h2>' + esc(t('words.tv.ready', { name: pl(G.explainer).name })) + '</h2><p>' + esc(t('words.tv.readySub', { team: teamName(G.team) })) + '</p>' +
        (G.mode === 'hat' ? '<p class="wd-mode">' + MODE_ICON[G.roundMode] + ' ' + esc(t('words.mode.' + G.roundMode)) + '</p>' : '') + '</div>');
    }
    if (ph === 'turn' || ph === 'last') {
      var draw = G.roundMode === 'draw' && ph === 'turn';
      if (setStage(k + ':' + ph, '<div class="wd-turn' + (draw ? ' draw' : '') + '" style="--c:' + tcol(G.team) + '">' +
        '<div class="wd-who">' + U.avatar(pl(G.explainer)) + '<b>' + esc(pl(G.explainer).name) + '</b><span>→ ' + esc(teamName(G.team)) + '</span></div>' +
        (draw ? '<div class="wd-slot" id="wdSlot"><div class="cr-board-wrap" id="wdWrap"><canvas id="wdCv"></canvas></div></div>' : '') +
        '<div class="wd-timer js-timer"></div>' +
        (ph === 'last' ? '<div class="wd-lastw">🔔 ' + esc(t('words.tv.last')) + '</div>' : '<div class="wd-hint">' + MODE_ICON[G.roundMode] + ' ' + esc(t('words.tv.hint.' + G.roundMode)) + '</div>') +
        '<div class="wd-count" id="wdCount"></div><div class="wd-chips" id="wdChips"></div></div>')) {
        lastGuessed = 0;
        if (draw) mountBoard();
      }
      var g = G.guessed || [];
      $('wdCount').textContent = t('words.tv.count', { n: g.length }) + (G.skipped ? ' · ' + t('words.tv.skips', { n: G.skipped }) : '');
      $('wdChips').innerHTML = g.map(function (w, i) { return '<span class="' + (i >= lastGuessed ? 'new' : '') + '">✓ ' + esc(w) + '</span>'; }).join('');
      if (g.length > lastGuessed && lastGuessed > 0) SFX.play('pop');
      lastGuessed = g.length;
      return;
    }
    if (ph === 'review') {
      var rv = G.review || [];
      var lastTxt = G.last ? (G.last.by != null ? t('words.tv.lastBy', { w: G.last.word, team: teamName(G.last.by) }) : t('words.tv.lastNone', { w: G.last.word })) : '';
      return setStage('rv' + k + JSON.stringify(rv) + JSON.stringify(G.last), '<div class="wd-review"><h2>' + esc(t('words.tv.review', { name: pl(G.explainer).name })) + '</h2>' +
        '<div class="wd-list">' + (rv.length ? rv.map(function (r) {
          return '<span class="' + (r.ok ? 'ok' : 'no') + '">' + (r.ok ? '✓ ' : '✗ ') + esc(r.word) + '</span>';
        }).join('') : '<i>' + esc(t('words.tv.none')) + '</i>') + '</div>' +
        (lastTxt ? '<p class="wd-sub">🔔 ' + esc(lastTxt) + '</p>' : '') +
        '<p class="wd-sub">' + esc(t('words.tv.reviewSub')) + '</p></div>');
    }
    if (ph === 'final') {
      var order = (G.scores || []).map(function (s, i) { return i; }).sort(function (a, b) { return G.scores[b] - G.scores[a]; });
      return setStage('final', '<div class="wd-final"><h2>🏁 ' + esc(t('words.tv.winner', { team: teamName(order[0]) })) + '</h2>' +
        order.map(function (i, n) {
          return '<div class="wd-frow" style="--c:' + tcol(i) + '"><b>' + (n + 1) + '. ' + esc(teamName(i)) + '</b><span>' + G.scores[i] + '</span></div>';
        }).join('') + '</div>');
    }
  }

  function mountBoard() {
    if (board) board.destroy();
    board = new CANVAS.Board($('wdCv'));
    if (pending) { board.reset(pending); pending = null; }
    var fit = function () {
      var sl = $('wdSlot'), w = $('wdWrap'); if (!sl || !w) return;
      var s = Math.max(60, Math.floor(Math.min(sl.clientWidth, sl.clientHeight)));
      w.style.width = w.style.height = s + 'px';
      if (board) board.resize();
    };
    if (ro) ro.disconnect();
    if (window.ResizeObserver) { ro = new ResizeObserver(fit); ro.observe($('wdSlot')); }
    fit();
  }

  function onEvent(ev, d) {
    if (ev === 'full') { if (board) board.reset(d.strokes || []); else pending = d.strokes || []; }
    else if (ev === 'ops' && board) board.apply(d.ops);
  }

  function unmount() {
    if (board) board.destroy(); board = null; if (ro) ro.disconnect();
    layout = null; stageKey = null; P = G = null; pending = null;
    var s = $('strip'); if (s) s.classList.remove('hidden');
  }
  window.GAMES = window.GAMES || {};
  (window.GAMES.words = window.GAMES.words || {}).tv = { render: render, unmount: unmount, onEvent: onEvent };
})();

/* «Снайпер» — экран ТВ */
(function () {
  'use strict';
  var t = U.t, esc = U.esc;
  var $ = function (id) { return document.getElementById(id); };
  var P = null, G = null, mode = null, lastImgK = null;

  function name(id) { return U.nameOf(P, id); }

  function render(p) {
    P = p; G = p.game;
    var ph = G.phase;
    $('phaseTitle').textContent = ph === 'calibrate' ? t('sniper.calibrate') : t('sniper.round', { n: G.n, total: G.total });
    $('phaseSub').textContent = ph === 'calibrate' ? t('sniper.calibrateSub') : t('sniper.speed', { ms: G.ms });
    var key = ph + ':' + G.n + ':' + i18n.getLang();
    if (key !== mode) {
      mode = key;
      lastImgK = null;
      if (ph === 'calibrate') $('main').innerHTML = '<div class="center-msg"><div class="sn-radar"></div><h1>📡</h1><div class="big">' + esc(t('sniper.calibrate')) + '</div></div>';
      else if (ph === 'intro') $('main').innerHTML = '<div class="center-msg sn-intro"><div class="sn-catch">' + esc(t('sniper.catch')) + '</div>' +
        '<div class="sn-card target">' + ART.itemSvg(G.target) + '</div><div class="sn-tname">' + esc(t('item.' + G.target)) + '</div><div class="sn-count" id="snCount"></div></div>';
      else if (ph === 'stream') $('main').innerHTML = '<div class="center-msg"><div class="sn-mini">' + esc(t('sniper.catch')) + ' ' + ART.itemSvg(G.target) + '<b>' + esc(t('item.' + G.target)) + '</b></div>' +
        '<div class="sn-card stream" id="snImg"></div></div>';
      else if (ph === 'results') $('main').innerHTML = resultsHtml();
      if (ph === 'stream' && G.cur) showImg(G.cur);
    }
    renderStrip();
  }

  // Обратный отсчёт 3-2-1 перед потоком картинок
  var lastCount = null;
  setInterval(function () {
    var el = document.getElementById('snCount');
    if (!el || !G || G.phase !== 'intro') { lastCount = null; return; }
    var n = Math.ceil(U.timeLeft() / 1000 / (U.timerTotal() / 3000 || 1));
    if (n < 1 || n > 3 || n === lastCount) return;
    lastCount = n;
    el.textContent = n;
    el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
    SFX.play('tick');
  }, 60);

  function resultsHtml() {
    var R = G.results;
    var rows = R.hits.length ? R.hits.map(function (h, i) {
      var p = U.playerById(P, h.id) || { name: '?', color: '#888' };
      return '<div class="sn-row' + (i === 0 ? ' first' : '') + '"><span class="pl">' + (i + 1) + '</span>' + U.avatar(p) + '<span class="nm">' + esc(p.name) + '</span>' +
        '<span class="ms">' + esc(t('sniper.ms', { n: h.ms })) + '</span><span class="pts">' + (h.pts ? '+' + h.pts : '0') + '</span></div>';
    }).join('') : '<div class="big">😶 ' + esc(t('sniper.nobody')) + '</div>';
    var wr = R.wrongs.length ? '<div class="sn-wrongs">' + esc(t('sniper.wrongs')) + ' ' + R.wrongs.map(function (w) {
      return esc(name(w.id)) + (w.n > 1 ? ' ×' + w.n : '') + ' (' + w.pts + ')';
    }).join(', ') + '</div>' : '';
    return '<div class="center-msg"><div class="sn-res-h">🎯 ' + esc(t('sniper.results')) + ' · ' + ART.itemSvg(G.target, 'sn-ico') + esc(t('item.' + G.target)) + '</div>' +
      '<div class="sn-table">' + rows + '</div>' + wr + '</div>';
  }

  function showImg(d) {
    var el = $('snImg');
    if (!el) return;
    if (d.k < 0) { el.innerHTML = ''; el.classList.add('empty'); return; }
    if (d.k === lastImgK) return;
    lastImgK = d.k;
    el.classList.remove('empty');
    el.innerHTML = ART.itemSvg(d.id);
  }

  function renderStrip() {
    var rows = G.rows.slice().sort(function (a, b) { return b.score - a.score; });
    $('strip').innerHTML = rows.map(function (r) {
      var p = U.playerById(P, r.id) || { name: '?', color: '#888' };
      var mark = G.phase === 'stream' ? (r.hit ? '<div class="check">✓</div>' : r.wrong ? '<div class="check bad">✗</div>' : '') : '';
      return '<div class="pcol">' + mark + U.avatar(p) + '<div class="pname">' + esc(p.name) + '</div><div class="sn-score">' + r.score + '</div></div>';
    }).join('');
  }

  function onEvent(ev, d) { if (ev === 'img' && G && G.phase === 'stream') showImg(d); }
  function unmount() { mode = null; lastImgK = null; P = G = null; }

  window.GAMES = window.GAMES || {};
  (window.GAMES.sniper = window.GAMES.sniper || {}).tv = { render: render, unmount: unmount, onEvent: onEvent };
})();

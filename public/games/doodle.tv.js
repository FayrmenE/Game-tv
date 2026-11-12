/* «Каракули» — экран ТВ */
(function () {
  'use strict';
  var t = U.t, esc = U.esc;
  var $ = function (id) { return document.getElementById(id); };
  var P = null, G = null, layout = null, board = null, shownArtist = null, revealKey = null, timers = [];
  function pl(id) { return U.playerById(P, id) || { name: '?', color: '#888' }; }
  function clear() { timers.forEach(clearTimeout); timers = []; }

  function render(p) {
    P = p; G = p.game;
    var ph = G.phase, c = G.cur;
    var sub = t('doodle.round', { n: G.round, total: G.rounds }) + (ph !== 'draw' ? ' · ' + t('doodle.left', { n: G.left }) : '');
    $('phaseTitle').textContent = t('doodle.' + ph + 'Tv') + (c && ph !== 'draw' ? ' · ' + t('doodle.by', { name: pl(c.artist).name }) : '');
    var hint = ph === 'draw' ? t('doodle.drawSub') : ph === 'lie' ? t('doodle.lieSub') : ph === 'vote' ? t('doodle.voteSub') : '';
    $('phaseSub').textContent = (hint ? hint + ' · ' : '') + sub;
    var want = (ph === 'draw' ? 'draw' : 'show') + i18n.getLang();
    if (layout !== want) {
      layout = want; clear();
      if (board) { board.destroy(); board = null; }
      shownArtist = null; revealKey = null;
      $('main').innerHTML = ph === 'draw' ? '<div class="center-msg"><h1>🖍️</h1><div class="big" id="ddDrawMsg"></div><div class="dd-grid" id="ddGrid"></div></div>' :
        '<div class="dd-show"><div class="dd-left"><div class="cr-board-wrap dd-board"><canvas id="ddCv"></canvas></div></div><div class="dd-right" id="ddRight"></div></div>';
      if (ph !== 'draw') board = new CANVAS.Board($('ddCv'));
    }
    if (ph === 'draw') {
      $('ddDrawMsg').textContent = t('doodle.drawTv');
      $('ddGrid').innerHTML = G.participants.map(function (id) {
        var d = G.done.indexOf(id) >= 0;
        return '<div class="dd-p' + (d ? ' done' : '') + '">' + U.avatar(pl(id)) + '<b>' + esc(pl(id).name) + '</b><span>' + (d ? '✓' : '✏️') + '</span></div>';
      }).join('');
    } else {
      if (shownArtist !== c.artist) { shownArtist = c.artist; board.reset(c.strokes || []); revealKey = null; clear(); }
      var right = $('ddRight');
      if (ph === 'lie') right.innerHTML = '<div class="dd-big">🤔 ' + esc(t('doodle.lieTv')) + '</div><div class="dd-sub">' + esc(t('doodle.lieSub')) + '</div>' + progress(c.wrote);
      else if (ph === 'vote') right.innerHTML = '<div class="dd-opts">' + c.options.map(function (o) {
        return '<div class="dd-opt">' + esc(o.text) + '</div>';
      }).join('') + '</div>' + progress(c.voted);
      else if (ph === 'reveal') showReveal(c);
    }
    $('strip').innerHTML = G.participants.slice().sort(function (a, b) { return (G.scores[b] || 0) - (G.scores[a] || 0); }).map(function (id) {
      return '<div class="pcol' + (c && c.artist === id && ph !== 'draw' ? ' turn' : '') + '">' + U.avatar(pl(id)) + '<div class="pname">' + esc(pl(id).name) +
        '</div><div class="sn-score">' + (G.scores[id] || 0) + '</div></div>';
    }).join('');
  }

  function progress(ids) {
    var need = G.participants.filter(function (id) { return id !== G.cur.artist; });
    return '<div class="dd-prog">' + need.map(function (id) {
      var ok = ids.indexOf(id) >= 0;
      return '<span class="' + (ok ? 'ok' : '') + '">' + U.avatar(pl(id)) + (ok ? '✓' : '…') + '</span>';
    }).join('') + '</div>';
  }

  function showReveal(c) {
    var k = c.artist + ':' + G.left + ':' + G.round;
    if (revealKey === k) return;
    revealKey = k; clear();
    // в том же (случайном) порядке, что и при голосовании — правда может открыться когда угодно
    var opts = c.options.slice();
    var right = $('ddRight');
    right.innerHTML = '<div class="dd-opts">' + opts.map(function (o, i) {
      var who = o.real ? t('doodle.truth') : o.house ? t('doodle.house') : t('doodle.lieOf', { names: o.authors.map(function (id) { return pl(id).name; }).join(', ') });
      return '<div class="dd-opt rv" id="ddo' + i + '"><div class="dd-t">' + esc(o.text) + '</div><div class="dd-v">' +
        o.voters.map(function (id) { return U.avatar(pl(id)); }).join('') + '</div><div class="dd-who">' + esc(who) + '</div></div>';
    }).join('') + '</div>';
    opts.forEach(function (o, i) {
      timers.push(setTimeout(function () {
        var e = $('ddo' + i); if (!e) return;
        e.classList.add('open'); if (o.real) { e.classList.add('real'); SFX.play('win'); } else SFX.play(o.voters.length ? 'ok' : 'tick');
      }, 700 + i * 2000));
    });
  }

  function unmount() { clear(); if (board) board.destroy(); board = null; layout = null; P = G = null; shownArtist = null; revealKey = null; }
  window.GAMES = window.GAMES || {};
  (window.GAMES.doodle = window.GAMES.doodle || {}).tv = { render: render, unmount: unmount };
})();

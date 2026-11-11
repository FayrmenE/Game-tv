/* «Морской бой» — экран телефона: расстановка и стрельба */
(function () {
  'use strict';
  var t = U.t, esc = U.esc;
  var $ = function (id) { return document.getElementById(id); };
  var P = null, G = null, el = null, ctx = null, key = null;
  var N = 10, ships = null, sel = -1, shipsFrom = null;

  function cells(s) { var o = []; for (var i = 0; i < s.len; i++) o.push(s.dir === 'v' ? [s.r + i, s.c] : [s.r, s.c + i]); return o; }
  // те же правила, что на сервере: в поле, без наложений и касаний
  function valid(list) {
    var g = {};
    for (var k = 0; k < list.length; k++) {
      var cs = cells(list[k]);
      for (var i = 0; i < cs.length; i++) {
        var r = cs[i][0], c = cs[i][1];
        if (r < 0 || c < 0 || r >= N || c >= N) return false;
        for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
          var o = g[(r + dr) * N + (c + dc)];
          if (r + dr >= 0 && c + dc >= 0 && r + dr < N && c + dc < N && o !== undefined && o !== k) return false;
        }
      }
      cs.forEach(function (x) { g[x[0] * N + x[1]] = k; });
    }
    return true;
  }
  function msg(emoji, title, sub) {
    return '<div class="card big-msg"><div class="emoji">' + emoji + '</div><h2>' + esc(title) + '</h2>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>';
  }

  /** Сетка 10×10. opts: ships, shots, click, mini, selShip */
  function grid(opts) {
    var map = {};
    (opts.ships || []).forEach(function (s, i) {
      cells(s).forEach(function (x) { map[x[0] * N + x[1]] = { i: i, hit: s.hits >= s.len }; });
    });
    var L = t('bs.letters'), h = '<div class="bs-grid ph' + (opts.mini ? ' mini' : '') + (opts.click ? ' live' : '') + (opts.cls ? ' ' + opts.cls : '') + '"><i></i>';
    for (var c = 0; c < N; c++) h += '<i class="bs-lbl">' + L.charAt(c) + '</i>';
    for (var r = 0; r < N; r++) {
      h += '<i class="bs-lbl">' + (r + 1) + '</i>';
      for (c = 0; c < N; c++) {
        var k = r * N + c, cls = 'bs-c', sh = map[k], st = opts.shots && opts.shots[k];
        if (sh) cls += ' ship' + (sh.i === opts.selShip ? ' sel' : '') + (sh.hit ? ' sunk-ship' : '');
        if (st) cls += ' ' + st;
        if (G.last && G.last.r === r && G.last.c === c && opts.lastOf === G.last.by) cls += ' last';
        h += '<b class="' + cls + '" data-r="' + r + '" data-c="' + c + '"></b>';
      }
    }
    return h + '</div>';
  }

  function set(k, html, after) { if (k === key) return; key = k; el.innerHTML = html; if (after) after(); }

  function render(p, root, c) {
    P = p; G = p.game; ctx = c;
    if (el !== root) { el = root; key = null; }
    var lang = i18n.getLang(), ph = G.phase;
    if (G.spectator) return set('spec' + lang, msg('👀', t('bs.spectator'), t('play.watch')));
    if (ph === 'place') return renderPlace(lang);
    if (ph === 'battle') {
      var mine = G.turn === G.me;
      return set('b:' + JSON.stringify([G.myShots, G.foeShots, G.turn, G.last && G.last.n]) + lang,
        '<div class="bs-phone">' +
        '<div class="bs-ptitle ' + (mine ? 'go' : '') + '">' + esc(mine ? '🎯 ' + t('bs.yourShot') : '⏳ ' + t('bs.foeShot')) + '</div>' +
        '<div class="bs-secs"><div class="bs-sec"><div class="bs-plbl">' + esc(t('bs.foeSea')) + ' · ' + esc(t('bs.fleetLeft')) + ' ' + G.boards[G.foe].fleet.left.length + '/10</div>' +
        grid({ shots: G.myShots, click: mine, lastOf: G.me }) + '</div>' +
        '<div class="bs-sec"><div class="bs-plbl">' + esc(t('bs.mySea')) + '</div>' +
        grid({ ships: G.myShips, shots: G.foeShots, mini: true, lastOf: G.foe }) + '</div></div></div>', function () {
        if (!mine) return;
        el.querySelectorAll('.bs-grid.live .bs-c').forEach(function (b) {
          b.onclick = function () {
            if (b.classList.contains('miss') || b.classList.contains('hit') || b.classList.contains('sunk') || b.classList.contains('auto')) return;
            b.classList.add('aim');
            SFX.play('shot');
            ctx.act('fire', { r: +b.dataset.r, c: +b.dataset.c });
          };
        });
      });
    }
    var won = G.winner === G.me;
    set('end' + won + lang, msg(won ? '🏆' : '🌊', won ? t('bs.youWin') : t('bs.youLose'), t('play.watch')));
  }

  function renderPlace(lang) {
    if (G.myReady) return set('ready' + lang, msg('⚓', t('bs.waitFoe'), t('play.watch')));
    var server = JSON.stringify(G.myShips.map(function (s) { return [s.r, s.c, s.len, s.dir]; }));
    if (server !== shipsFrom) { shipsFrom = server; ships = G.myShips.map(function (s) { return { r: s.r, c: s.c, len: s.len, dir: s.dir }; }); sel = -1; }
    set('place:' + JSON.stringify(ships) + sel + lang,
      '<div class="bs-phone"><div class="bs-ptitle">🚢 ' + esc(t('bs.yourFleet')) + '</div><p class="bs-hint">' + esc(t('bs.tapShip')) + '</p>' +
      grid({ ships: ships, click: true, selShip: sel, cls: 'place' }) +
      '<div class="host-row"><button class="btn sec" id="bsRot"' + (sel < 0 ? ' disabled' : '') + '>' + esc(t('bs.rotate')) + '</button>' +
      '<button class="btn sec" id="bsRnd">' + esc(t('bs.random')) + '</button></div>' +
      '<button class="btn" id="bsReady">' + esc(t('bs.readyBtn')) + '</button></div>', function () {
      el.querySelectorAll('.bs-grid.live .bs-c').forEach(function (b) {
        b.onclick = function () {
          var r = +b.dataset.r, c = +b.dataset.c;
          var hit = ships.findIndex(function (s) { return cells(s).some(function (x) { return x[0] === r && x[1] === c; }); });
          if (hit >= 0) { sel = hit === sel ? -1 : hit; key = null; return renderPlace(lang); }
          if (sel < 0) return;
          var moved = ships.map(function (s, i) { return i === sel ? { r: r, c: c, len: s.len, dir: s.dir } : s; });
          if (!valid(moved)) { ctx.showErr(t('bs.cantHere')); SFX.play('err'); return; }
          commit(moved);
        };
      });
      $('bsRot').onclick = function () {
        if (sel < 0) return;
        var moved = ships.map(function (s, i) { return i === sel ? { r: s.r, c: s.c, len: s.len, dir: s.dir === 'h' ? 'v' : 'h' } : s; });
        if (!valid(moved)) { ctx.showErr(t('bs.cantHere')); SFX.play('err'); return; }
        commit(moved);
      };
      $('bsRnd').onclick = function () { ctx.act('random'); };
      $('bsReady').onclick = function () { ctx.act('ready'); };
    });
  }

  function commit(list) {
    ships = list;
    shipsFrom = JSON.stringify(list.map(function (s) { return [s.r, s.c, s.len, s.dir]; }));
    ctx.act('fleet', { ships: list });
    key = null;
    renderPlace(i18n.getLang());
  }

  function hostButtons(p) {
    var g = p.game || {};
    var n = p.players.filter(function (x) { return x.connected; }).length;
    return g.phase === 'place' && n > 2 ? [{ label: '🔄 ' + t('bs.swap'), action: 'bs:swap', cls: 'sec' }] : [];
  }

  function unmount() { key = null; P = G = null; el = null; ships = null; sel = -1; shipsFrom = null; }
  window.GAMES = window.GAMES || {};
  (window.GAMES.battleship = window.GAMES.battleship || {}).play = { render: render, unmount: unmount, hostButtons: hostButtons,
    hideReactions: function (p) { return !(p.game && p.game.spectator); } };
})();

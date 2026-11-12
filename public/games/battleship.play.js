/* «Морской бой» — экран телефона: расстановка и стрельба */
(function () {
  'use strict';
  var t = U.t, esc = U.esc;
  var $ = function (id) { return document.getElementById(id); };
  var P = null, G = null, el = null, ctx = null, key = null;
  var N = 10, ships = null, sel = -1, shipsFrom = null, pending = null;

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

  /* ---------------- расстановка: перетаскивание пальцем ---------------- */
  // Тап по кораблю — выбрать (и «Повернуть»), потянуть — переместить. Пока тянете,
  // клетки под кораблём подсвечиваются: зелёные — можно поставить, красные — нельзя.
  function renderPlace(lang) {
    if (G.myReady) return set('ready' + lang, msg('⚓', t('bs.waitFoe'), t('play.watch')));
    var server = JSON.stringify(G.myShips.map(function (s) { return [s.r, s.c, s.len, s.dir]; }));
    // пока сервер не подтвердил наш перенос, старое состояние не применяем
    if (pending && server !== pending.str && Date.now() < pending.until) server = shipsFrom;
    if (pending && (server === pending.str || Date.now() >= pending.until)) pending = null;
    if (server !== shipsFrom) {
      // сохраняем выделение: ищем тот же корабль в новом списке
      var was = sel >= 0 && ships ? ships[sel] : null;
      shipsFrom = server;
      ships = G.myShips.map(function (s) { return { r: s.r, c: s.c, len: s.len, dir: s.dir }; });
      sel = was ? ships.findIndex(function (s) { return s.r === was.r && s.c === was.c && s.len === was.len && s.dir === was.dir; }) : -1;
    }
    set('place:' + JSON.stringify(ships) + sel + lang,
      '<div class="bs-phone"><div class="bs-ptitle">🚢 ' + esc(t('bs.yourFleet')) + '</div><p class="bs-hint">' + esc(t('bs.dragHint')) + '</p>' +
      grid({ ships: ships, click: true, selShip: sel, cls: 'place' }) +
      '<div class="host-row"><button class="btn sec" id="bsRot"' + (sel < 0 ? ' disabled' : '') + '>' + esc(t('bs.rotate')) + '</button>' +
      '<button class="btn sec" id="bsRnd">' + esc(t('bs.random')) + '</button></div>' +
      '<button class="btn" id="bsReady">' + esc(t('bs.readyBtn')) + '</button></div>', bindPlace);
  }

  function bindPlace() {
    var gridEl = el.querySelector('.bs-grid.place');
    var cellEls = gridEl.querySelectorAll('.bs-c');
    var cellAt = function (r, c) { return cellEls[r * N + c]; };
    var drag = null;

    function geom() {
      var a = cellAt(0, 0).getBoundingClientRect(), z = cellAt(N - 1, N - 1).getBoundingClientRect();
      return { x0: a.left, y0: a.top, w: (z.right - a.left) / N, h: (z.bottom - a.top) / N };
    }
    function cellFromPoint(x, y) {
      var g = geom();
      return { r: Math.floor((y - g.y0) / g.h), c: Math.floor((x - g.x0) / g.w) };
    }
    function clearPreview() {
      cellEls.forEach(function (e) { e.classList.remove('pv-ok', 'pv-bad', 'drag-src'); });
    }
    function preview(cand, ok) {
      clearPreview();
      cells(ships[drag.i]).forEach(function (x) { var e = cellAt(x[0], x[1]); if (e) e.classList.add('drag-src'); });
      cells(cand).forEach(function (x) {
        if (x[0] < 0 || x[1] < 0 || x[0] >= N || x[1] >= N) return;
        cellAt(x[0], x[1]).classList.add(ok ? 'pv-ok' : 'pv-bad');
      });
    }
    function candidate(x, y) {
      var p = cellFromPoint(x, y), s = ships[drag.i];
      var r = p.r - (s.dir === 'v' ? drag.off : 0), c = p.c - (s.dir === 'h' ? drag.off : 0);
      return { r: r, c: c, len: s.len, dir: s.dir };
    }

    gridEl.addEventListener('pointerdown', function (e) {
      var b = e.target.closest('.bs-c');
      if (!b) return;
      var r = +b.dataset.r, c = +b.dataset.c;
      var i = ships.findIndex(function (s) { return cells(s).some(function (x) { return x[0] === r && x[1] === c; }); });
      if (i < 0) { if (sel >= 0) { sel = -1; key = null; renderPlace(i18n.getLang()); } return; }
      e.preventDefault();
      var s = ships[i];
      drag = { i: i, off: s.dir === 'h' ? c - s.c : r - s.r, moved: false, x: e.clientX, y: e.clientY, cand: null, ok: false };
      try { gridEl.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
    });
    gridEl.addEventListener('pointermove', function (e) {
      if (!drag) return;
      if (!drag.moved && Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) < 8) return;
      drag.moved = true;
      var cand = candidate(e.clientX, e.clientY);
      if (drag.cand && cand.r === drag.cand.r && cand.c === drag.cand.c) return;
      drag.cand = cand;
      drag.ok = valid(ships.map(function (s, k) { return k === drag.i ? cand : s; }));
      preview(cand, drag.ok);
    });
    var finish = function () {
      if (!drag) return;
      var d = drag; drag = null;
      clearPreview();
      if (!d.moved) { sel = sel === d.i ? -1 : d.i; key = null; return renderPlace(i18n.getLang()); }
      if (d.cand && d.ok) { sel = d.i; SFX.play('pop'); return commit(ships.map(function (s, k) { return k === d.i ? d.cand : s; })); }
      SFX.play('err'); ctx.showErr(t('bs.cantHere'));
    };
    gridEl.addEventListener('pointerup', finish);
    gridEl.addEventListener('pointercancel', function () { drag = null; clearPreview(); });

    $('bsRot').onclick = function () {
      if (sel < 0) return;
      var moved = ships.map(function (s, i) { return i === sel ? { r: s.r, c: s.c, len: s.len, dir: s.dir === 'h' ? 'v' : 'h' } : s; });
      if (!valid(moved)) { ctx.showErr(t('bs.cantRotate')); SFX.play('err'); return; }
      commit(moved);
    };
    $('bsRnd').onclick = function () { ctx.act('random'); };
    $('bsReady').onclick = function () { ctx.act('ready'); };
  }

  function commit(list) {
    ships = list;
    shipsFrom = JSON.stringify(list.map(function (s) { return [s.r, s.c, s.len, s.dir]; }));
    pending = { str: shipsFrom, until: Date.now() + 2500 };
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

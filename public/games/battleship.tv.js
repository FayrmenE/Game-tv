/* «Морской бой» — экран ТВ: два моря в «тумане войны», видны только выстрелы */
(function () {
  'use strict';
  var t = U.t, esc = U.esc;
  var $ = function (id) { return document.getElementById(id); };
  var P = null, G = null, mode = null, lastShot = null, confettiDone = false;
  var N = 10;

  function cellName(r, c) { return t('bs.letters').charAt(c) + (r + 1); }
  function pl(id) { return U.playerById(P, id) || { name: '?', color: '#888' }; }

  function boardHtml(id) {
    var b = G.boards[id], shots = b.shots || {}, ships = {};
    if (b.ships) b.ships.forEach(function (s) {
      for (var i = 0; i < s.len; i++) ships[(s.dir === 'v' ? s.r + i : s.r) * N + (s.dir === 'h' ? s.c + i : s.c)] = s.sunk ? 'ship sunk-ship' : 'ship';
    });
    var L = t('bs.letters'), h = '<div class="bs-grid"><i></i>';
    for (var c = 0; c < N; c++) h += '<i class="bs-lbl">' + L.charAt(c) + '</i>';
    for (var r = 0; r < N; r++) {
      h += '<i class="bs-lbl">' + (r + 1) + '</i>';
      for (c = 0; c < N; c++) {
        var k = r * N + c, s = shots[k], cls = 'bs-c';
        if (ships[k]) cls += ' ' + ships[k];
        if (s) cls += ' ' + s;
        if (G.last && G.last.r === r && G.last.c === c && G.last.by !== id) cls += ' last';
        h += '<b class="' + cls + '"></b>';
      }
    }
    return h + '</div>';
  }

  function fleetHtml(f) {
    return '<span class="bs-fleet">' + f.left.map(function (len) { return '<em style="width:' + (len * 0.9) + 'em"></em>'; }).join('') + '</span>';
  }

  function render(p) {
    P = p; G = p.game;
    var ph = G.phase;
    if (ph === 'place') { $('phaseTitle').textContent = t('bs.place'); $('phaseSub').textContent = t('bs.placeSub'); }
    else if (ph === 'battle') { $('phaseTitle').textContent = t('bs.turn', { name: pl(G.turn).name }); $('phaseSub').textContent = t('bs.turnSub'); }
    else { $('phaseTitle').textContent = t('bs.win', { name: pl(G.winner).name }); $('phaseSub').textContent = ''; }
    if (mode !== i18n.getLang()) { mode = i18n.getLang(); $('main').innerHTML = '<div class="bs-wrap"><div class="bs-shot" id="bsShot"></div><div class="bs-seas" id="bsSeas"></div></div>'; }
    // Поле игрока id — это его море: выстрелы по нему делает соперник
    $('bsSeas').innerHTML = G.order.map(function (id) {
      var b = G.boards[id], who = pl(id);
      var isTarget = ph === 'battle' && G.turn !== id;
      var status = ph === 'place' ? (b.ready ? t('bs.ready') : t('bs.placing')) : '';
      return '<div class="bs-sea' + (isTarget ? ' target' : '') + (G.winner === id ? ' winner' : '') + '">' +
        '<div class="bs-cap">' + U.avatar(who) + '<b>' + esc(who.name) + '</b>' +
        (status ? '<span class="bs-st' + (b.ready ? ' ok' : '') + '">' + esc(status) + '</span>' : fleetHtml(b.fleet)) +
        (isTarget ? '<span class="bs-tg">' + esc(t('bs.target')) + '</span>' : '') + '</div>' + boardHtml(id) + '</div>';
    }).join('');
    // результат последнего выстрела — крупно
    var s = $('bsShot');
    if (G.last && G.last.n !== lastShot) {
      lastShot = G.last.n;
      var L = G.last, txt = L.result === 'sunk' ? t('bs.sunk', { cell: cellName(L.r, L.c), n: L.len }) : L.result === 'hit' ? t('bs.hit', { cell: cellName(L.r, L.c) }) : t('bs.miss', { cell: cellName(L.r, L.c) });
      s.className = 'bs-shot show ' + L.result;
      s.innerHTML = '<b>' + esc(pl(L.by).name) + ':</b> ' + esc(txt) + (L.auto ? ' <small>' + esc(t('bs.auto')) + '</small>' : '');
      void s.offsetWidth;
    } else if (!G.last) s.innerHTML = '';
    if (ph === 'end' && !confettiDone && window.SHELL && SHELL.confetti) { confettiDone = true; SHELL.confetti(); }
    if (ph !== 'end') confettiDone = false;
    $('strip').innerHTML = '';
  }

  function unmount() { mode = null; lastShot = null; P = G = null; }
  window.GAMES = window.GAMES || {};
  (window.GAMES.battleship = window.GAMES.battleship || {}).tv = { render: render, unmount: unmount };
})();

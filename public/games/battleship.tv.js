/* «Морской бой» — экран ТВ: два моря в «тумане войны», над морем-целью — корабль, который стреляет */
(function () {
  'use strict';
  var t = U.t, esc = U.esc;
  var $ = function (id) { return document.getElementById(id); };
  var P = null, G = null, mode = null, lastShot = null, landed = null, confettiDone = false;

  function cellName(r, c) { return t('bs.letters').charAt(c) + (r + 1); }
  function pl(id) { return U.playerById(P, id) || { name: '?', color: '#888' }; }
  function fleetHtml(f) {
    return '<span class="bs-fleet">' + f.left.map(function (len) { return '<em style="width:' + (len * 0.9) + 'em"></em>'; }).join('') + '</span>';
  }

  function render(p) {
    P = p; G = p.game;
    var ph = G.phase;
    if (ph === 'place') { $('phaseTitle').textContent = t('bs.place'); $('phaseSub').textContent = t('bs.placeSub'); }
    else if (ph === 'battle') { $('phaseTitle').textContent = t('bs.turn', { name: pl(G.turn).name }); $('phaseSub').textContent = t('bs.turnSub'); }
    else { $('phaseTitle').textContent = t('bs.win', { name: pl(G.winner).name }); $('phaseSub').textContent = ''; }
    if (mode !== i18n.getLang()) {
      mode = i18n.getLang();
      $('main').innerHTML = '<div class="bs-wrap" id="bsWrap"><div class="bs-shot" id="bsShot"></div><div class="bs-seas" id="bsSeas"></div></div>';
    }
    var fresh = G.last && G.last.n !== lastShot;
    var pendingLand = G.last && G.last.n !== landed;
    // Поле игрока id — это его море: по нему стреляет соперник
    $('bsSeas').innerHTML = G.order.map(function (id) {
      var b = G.boards[id], who = pl(id);
      var isTarget = ph === 'battle' && G.turn !== id;
      var status = ph === 'place' ? (b.ready ? t('bs.ready') : t('bs.placing')) : '';
      var last = G.last && G.last.by !== id ? { r: G.last.r, c: G.last.c } : null;
      return '<div class="bs-sea' + (isTarget ? ' target' : '') + (G.winner === id ? ' winner' : '') + '" data-sea="' + id + '">' +
        '<div class="bs-cap">' + U.avatar(who) + '<b>' + esc(who.name) + '</b>' +
        (status ? '<span class="bs-st' + (b.ready ? ' ok' : '') + '">' + esc(status) + '</span>' : fleetHtml(b.fleet)) + '</div>' +
        '<div class="bs-gunboat' + (isTarget || (last && pendingLand) ? ' on' : '') + '">' + SHIPS.gunboat() + '</div>' +
        SHIPS.gridHtml({ ships: b.ships || b.sunkShips, shots: b.shots, last: last, cls: pendingLand && last ? 'incoming' : '' }) + '</div>';
    }).join('');
    if (fresh) {
      lastShot = G.last.n;
      var L = G.last, sea = document.querySelector('.bs-sea[data-sea="' + G.order.find(function (x) { return x !== L.by; }) + '"]');
      var cell = sea && sea.querySelector('.bs-c[data-r="' + L.r + '"][data-c="' + L.c + '"]');
      var text = L.result === 'sunk' ? t('bs.sunk', { cell: cellName(L.r, L.c), n: L.len }) : L.result === 'hit' ? t('bs.hit', { cell: cellName(L.r, L.c) }) : t('bs.miss', { cell: cellName(L.r, L.c) });
      var shot = $('bsShot');
      shot.className = 'bs-shot'; shot.innerHTML = '🎯 <b>' + esc(pl(L.by).name) + '</b> → ' + esc(cellName(L.r, L.c));
      SHIPS.fireAt($('bsWrap'), sea && sea.querySelector('.bs-gunboat'), cell, L.result, function () {
        landed = L.n;
        var g = document.querySelector('.bs-grid.incoming'); if (g) g.classList.remove('incoming');
        if (L.n !== lastShot) return;
        shot.className = 'bs-shot show ' + L.result;
        shot.innerHTML = '<b>' + esc(pl(L.by).name) + ':</b> ' + esc(text) + (L.auto ? ' <small>' + esc(t('bs.auto')) + '</small>' : '');
      });
    } else if (!G.last) $('bsShot').innerHTML = '';
    if (ph === 'end' && !confettiDone && window.SHELL && SHELL.confetti) { confettiDone = true; SHELL.confetti(); }
    if (ph !== 'end') confettiDone = false;
    $('strip').innerHTML = '';
  }

  function unmount() { mode = null; lastShot = null; landed = null; P = G = null; }
  window.GAMES = window.GAMES || {};
  (window.GAMES.battleship = window.GAMES.battleship || {}).tv = { render: render, unmount: unmount };
})();

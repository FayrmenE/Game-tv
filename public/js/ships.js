/*
 * «Морской бой»: рисунки кораблей и общая сетка поля для ТВ и телефона.
 * Корабль — один SVG на всю длину (1–4 клетки), лежит ПОД клетками, поэтому
 * отметки попаданий видны поверх корпуса.
 * Чтобы заменить рисунки на нарисованные картинки, положите их в
 * /img/ships/ship1.png … ship4.png (+ wreck1…4.png) и выставьте SHIPS.useImages = true.
 */
(function () {
  'use strict';
  var D = '#2d2a3e', N = 10;

  /** Корпус вида сверху длиной len клеток (горизонтально, нос справа) */
  function hull(len, sunk) {
    var W = len * 100;
    var body = sunk ? '#5b4b4b' : '#9aa5b8', deck = sunk ? '#4a3c3c' : '#c3cad6', gun = sunk ? '#2b2222' : '#495468';
    var nose = W - 8;
    var h = '<path d="M10 22 Q4 22 4 34 V66 Q4 78 10 78 H' + (W - 46) + ' Q' + (nose - 10) + ' 78 ' + nose + ' 50 Q' + (nose - 10) + ' 22 ' + (W - 46) + ' 22 Z" fill="' + body + '" stroke="' + D + '" stroke-width="6" stroke-linejoin="round"/>' +
      '<path d="M18 34 H' + (W - 52) + ' Q' + (nose - 22) + ' 34 ' + (nose - 16) + ' 50 Q' + (nose - 22) + ' 66 ' + (W - 52) + ' 66 H18 Z" fill="' + deck + '"/>';
    if (len === 1) {
      h += '<rect x="24" y="38" width="30" height="24" rx="5" fill="' + gun + '" stroke="' + D + '" stroke-width="3"/>';
    } else {
      for (var i = 0; i < len; i++) {
        var cx = 50 + i * 100 - (i === len - 1 ? 14 : 0);
        if (i === 1 && len >= 3) h += '<rect x="' + (cx - 22) + '" y="32" width="44" height="36" rx="6" fill="' + gun + '" stroke="' + D + '" stroke-width="3"/><rect x="' + (cx - 6) + '" y="24" width="12" height="16" rx="3" fill="' + D + '"/>';
        else h += '<circle cx="' + cx + '" cy="50" r="15" fill="' + gun + '" stroke="' + D + '" stroke-width="3"/><rect x="' + cx + '" y="46" width="30" height="8" rx="3" fill="' + D + '"/>';
      }
    }
    if (sunk) {
      h += '<path d="M' + (W * 0.3) + ' 24 l12 18 l-10 10 l14 24 M' + (W * 0.68) + ' 22 l-8 22 l12 8 l-6 26" fill="none" stroke="#1b1414" stroke-width="5" stroke-linecap="round"/>';
      for (var k = 0; k < len; k++) h += '<circle cx="' + (40 + k * 100) + '" cy="40" r="10" fill="#ff7b00" opacity=".85"/><circle cx="' + (44 + k * 100) + '" cy="36" r="5" fill="#ffd60a"/>';
    } else {
      h += '<path d="M24 30 H' + (W - 60) + '" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".45"/>';
    }
    return h;
  }

  function shipSvg(len, dir, sunk) {
    if (SHIPS.useImages) {
      return '<img alt="" draggable="false" src="/img/ships/' + (sunk ? 'wreck' : 'ship') + len + '.png" class="' + (dir === 'v' ? 'rot' : '') + '">';
    }
    var W = len * 100;
    if (dir === 'v') return '<svg viewBox="0 0 100 ' + W + '" preserveAspectRatio="none"><g transform="translate(100,0) rotate(90)">' + hull(len, sunk) + '</g></svg>';
    return '<svg viewBox="0 0 ' + W + ' 100" preserveAspectRatio="none">' + hull(len, sunk) + '</svg>';
  }

  /** Корабль-стрелок (вид сбоку) — стоит над морем соперника и стреляет */
  function gunboat() {
    return '<svg viewBox="0 0 220 110" class="bs-gunboat-svg">' +
      '<path d="M8 66 H212 L188 100 H32 Z" fill="#9aa5b8" stroke="' + D + '" stroke-width="5" stroke-linejoin="round"/>' +
      '<rect x="70" y="40" width="64" height="28" rx="4" fill="#c3cad6" stroke="' + D + '" stroke-width="4"/>' +
      '<rect x="86" y="18" width="14" height="24" fill="#6c757d" stroke="' + D + '" stroke-width="4"/>' +
      '<g class="bs-barrel"><rect x="132" y="44" width="62" height="11" rx="4" fill="#495468" stroke="' + D + '" stroke-width="4"/></g>' +
      '<circle cx="138" cy="50" r="13" fill="#495468" stroke="' + D + '" stroke-width="4"/>' +
      '<path d="M8 100 q20 -10 40 0 t40 0 t40 0 t40 0 t40 0" fill="none" stroke="#4cc9f0" stroke-width="5"/>' +
      '</svg>';
  }

  /**
   * Сетка поля. opts: { ships:[{r,c,len,dir,sunk|hits}], shots:{k:'miss'|'hit'|'sunk'|'auto'},
   *   last:{r,c}, live:bool, sel:index, cls:'...' }
   */
  function gridHtml(opts) {
    var L = window.U ? U.t('bs.letters') : 'ABCDEFGHIJ';
    var h = '<div class="bs-grid' + (opts.cls ? ' ' + opts.cls : '') + (opts.live ? ' live' : '') + '">';
    for (var c = 0; c < N; c++) h += '<i class="bs-lbl" style="grid-area:1/' + (c + 2) + '">' + L.charAt(c) + '</i>';
    for (var r = 0; r < N; r++) h += '<i class="bs-lbl" style="grid-area:' + (r + 2) + '/1">' + (r + 1) + '</i>';
    var shipCell = {};
    (opts.ships || []).forEach(function (s, i) {
      var sunk = s.sunk || (s.hits != null && s.hits >= s.len);
      for (var k = 0; k < s.len; k++) shipCell[(s.dir === 'v' ? s.r + k : s.r) * N + (s.dir === 'h' ? s.c + k : s.c)] = i;
      var area = (s.r + 2) + '/' + (s.c + 2) + '/span ' + (s.dir === 'v' ? s.len : 1) + '/span ' + (s.dir === 'h' ? s.len : 1);
      h += '<div class="bs-ship' + (sunk ? ' wreck' : '') + (i === opts.sel ? ' sel' : '') + '" data-ship="' + i + '" style="grid-area:' + area + '">' + shipSvg(s.len, s.dir, sunk) + '</div>';
    });
    for (r = 0; r < N; r++) for (c = 0; c < N; c++) {
      var k2 = r * N + c, cls = 'bs-c', st = opts.shots && opts.shots[k2];
      if (shipCell[k2] != null) cls += ' ship';
      if (st) cls += ' ' + st;
      if (opts.last && opts.last.r === r && opts.last.c === c) cls += ' last';
      h += '<b class="' + cls + '" data-r="' + r + '" data-c="' + c + '" style="grid-area:' + (r + 2) + '/' + (c + 2) + '"></b>';
    }
    return h + '</div>';
  }

  /* ---------------- анимация выстрела (ТВ) ---------------- */
  /** Снаряд летит по дуге из пушки корабля в клетку, затем взрыв или всплеск.
   *  layer — слой эффектов (position:relative), координаты считаются от него. */
  function fireAt(layer, boat, cellEl, result, done) {
    if (!layer || !boat || !cellEl || !layer.animate) { if (done) done(); return; }
    var lr = layer.getBoundingClientRect(), br = boat.getBoundingClientRect(), cr = cellEl.getBoundingClientRect();
    var mirror = !!boat.closest('.bs-sea.right');
    var x0 = br.left + br.width * (mirror ? 0.12 : 0.88) - lr.left, y0 = br.top + br.height * 0.45 - lr.top;
    var x1 = cr.left + cr.width / 2 - lr.left, y1 = cr.top + cr.height / 2 - lr.top;
    boat.classList.remove('recoil'); void boat.offsetWidth; boat.classList.add('recoil');
    var ball = document.createElement('div');
    ball.className = 'bs-ball';
    ball.style.setProperty('--s', Math.max(10, cr.width * 0.45) + 'px');
    layer.appendChild(ball);
    var peak = Math.min(y0, y1) - Math.max(25, Math.hypot(x1 - x0, y1 - y0) * 0.12);
    SFX.play('shot');
    var anim = ball.animate([
      { transform: 'translate(' + x0 + 'px,' + y0 + 'px) scale(.5)' },
      { transform: 'translate(' + ((x0 + x1) / 2) + 'px,' + peak + 'px) scale(1.3)', offset: 0.5 },
      { transform: 'translate(' + x1 + 'px,' + y1 + 'px) scale(.8)' }
    ], { duration: 700, easing: 'cubic-bezier(.35,.1,.65,1)' });
    anim.onfinish = function () {
      ball.remove();
      var fx = document.createElement('div');
      fx.className = 'bs-fx ' + (result === 'miss' ? 'splash' : 'boom' + (result === 'sunk' ? ' big' : ''));
      fx.style.left = x1 + 'px'; fx.style.top = y1 + 'px';
      fx.style.setProperty('--s', cr.width + 'px');
      fx.innerHTML = '<i></i><i></i><i></i><i></i><i></i><i></i><b></b>';
      layer.appendChild(fx);
      SFX.play(result === 'miss' ? 'splash' : result === 'sunk' ? 'sink' : 'boom');
      setTimeout(function () { fx.remove(); }, 1200);
      if (done) done();
    };
  }

  window.SHIPS = { useImages: false, shipSvg: shipSvg, gunboat: gunboat, gridHtml: gridHtml, fireAt: fireAt };
})();

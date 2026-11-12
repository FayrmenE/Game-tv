/*
 * Все иллюстрации игры «Чужой» — нарисованы вручную в SVG.
 *
 * Каждый предмет — отдельная функция, рисующая его в собственной системе
 * координат 100×100. Это позволяет:
 *   (а) показать предмет крупно на телефоне            — ART.itemSvg(id)
 *   (б) подсветить / приблизить предмет на ТВ          — <g id="item-<id>"> в ART.sceneSvg()
 *   (в) сделать предмет кликабельным на телефоне       — data-item="<id>" в ART.sceneSvg()
 *
 * Работает и в браузере (window.ART), и в Node (module.exports) — для проверок.
 */
(function (root) {
  'use strict';

  var D = '#2d2a3e'; // общий цвет контура
  function st(w) {
    return 'stroke="' + D + '" stroke-width="' + (w || 3) + '" stroke-linejoin="round" stroke-linecap="round"';
  }
  function line(d, color, w) {
    return '<path d="' + d + '" fill="none" stroke="' + (color || D) + '" stroke-width="' + (w || 3) + '" stroke-linecap="round" stroke-linejoin="round"/>';
  }
  // Толстая линия с контуром (ручки, хвосты, ремни)
  function tube(d, color, w) {
    return line(d, D, w + 5) + line(d, color, w);
  }
  function pt(cx, cy, r, deg) {
    var a = (deg - 90) * Math.PI / 180;
    return [+(cx + r * Math.cos(a)).toFixed(2), +(cy + r * Math.sin(a)).toFixed(2)];
  }
  // Сектора круга (мяч) или кольца (спасательный круг)
  function sectors(cx, cy, rOut, rIn, colors, offset) {
    var n = colors.length, step = 360 / n, out = '';
    for (var i = 0; i < n; i++) {
      var a0 = i * step + (offset || 0), a1 = a0 + step;
      var o0 = pt(cx, cy, rOut, a0), o1 = pt(cx, cy, rOut, a1);
      var d;
      if (rIn > 0) {
        var i0 = pt(cx, cy, rIn, a0), i1 = pt(cx, cy, rIn, a1);
        d = 'M' + o0 + ' A' + rOut + ' ' + rOut + ' 0 0 1 ' + o1 + ' L' + i1 + ' A' + rIn + ' ' + rIn + ' 0 0 0 ' + i0 + 'Z';
      } else {
        d = 'M' + cx + ' ' + cy + ' L' + o0 + ' A' + rOut + ' ' + rOut + ' 0 0 1 ' + o1 + 'Z';
      }
      out += '<path d="' + d + '" fill="' + colors[i] + '"/>';
    }
    return out;
  }
  function star(cx, cy, rOut, rIn, n) {
    var d = '';
    for (var i = 0; i < n * 2; i++) {
      var p = pt(cx, cy, i % 2 ? rIn : rOut, i * 180 / n);
      d += (i ? 'L' : 'M') + p[0] + ' ' + p[1];
    }
    return d + 'Z';
  }
  function dots(list, r, fill) {
    return list.map(function (p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + r + '" fill="' + fill + '"/>'; }).join('');
  }
  var shine = function (d) { return '<path d="' + d + '" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".55"/>'; };

  /* ---------------------------------------------------------------- */
  /*  Параметрические «родственники» — так пары получаются похожими  */
  /* ---------------------------------------------------------------- */

  function mug(c) {
    return tube('M70 42 q20 0 20 16 q0 18 -22 18', c, 5) +
      '<path d="M18 30 h54 v46 q0 12 -12 12 h-30 q-12 0 -12 -12 z" fill="' + c + '" ' + st() + '/>' +
      '<ellipse cx="45" cy="30" rx="27" ry="6" fill="#6b3e26" ' + st() + '/>' +
      line('M34 20 q-5 -6 0 -12 M48 20 q-5 -6 0 -12', '#b8b8c8', 3) +
      '<rect x="25" y="40" width="9" height="34" rx="4" fill="#fff" opacity=".35"/>';
  }

  function pet(kind, c, c2) {
    var s = tube('M70 82 q24 -4 16 -30', c, 5) +
      '<ellipse cx="50" cy="72" rx="24" ry="20" fill="' + c + '" ' + st() + '/>' +
      '<ellipse cx="50" cy="76" rx="12" ry="12" fill="' + c2 + '"/>';
    if (kind === 'cat') s += '<path d="M33 34 l1 -24 l16 12z M67 34 l-1 -24 l-16 12z" fill="' + c + '" ' + st() + '/>' +
      '<path d="M36 28 l1 -12 l7 6z M64 28 l-1 -12 l-7 6z" fill="#f7a6b8"/>';
    s += '<circle cx="50" cy="40" r="20" fill="' + c + '" ' + st() + '/>';
    if (kind === 'dog') s += '<ellipse cx="30" cy="42" rx="7" ry="15" fill="' + c2 + '" ' + st() + ' transform="rotate(18 30 42)"/>' +
      '<ellipse cx="70" cy="42" rx="7" ry="15" fill="' + c2 + '" ' + st() + ' transform="rotate(-18 70 42)"/>' +
      '<ellipse cx="50" cy="49" rx="10" ry="7" fill="#fff4e0" ' + st(2) + '/>' +
      '<ellipse cx="50" cy="45" rx="4" ry="3" fill="' + D + '"/>' +
      '<path d="M47 54 q3 8 6 0z" fill="#ff6b81" ' + st(1.5) + '/>';
    s += '<circle cx="43" cy="37" r="3" fill="' + D + '"/><circle cx="57" cy="37" r="3" fill="' + D + '"/>';
    if (kind === 'cat') s += '<path d="M47 45 h6 l-3 3z" fill="#e5737f"/>' +
      line('M40 47 h-15 M40 50 l-14 5 M60 47 h15 M60 50 l14 5', D, 1.5);
    return s;
  }

  function shaker(content, dotsColor, holes) {
    return '<path d="M32 40 h36 l4 46 h-44z" fill="#e3f4ff" ' + st() + '/>' +
      '<path d="M33.5 56 h33 l2.6 28 h-38.2z" fill="' + content + '"/>' +
      dots([[40, 64], [52, 72], [62, 62], [45, 78], [58, 79]], 1.6, dotsColor) +
      '<path d="M34 40 q0 -24 16 -24 q16 0 16 24z" fill="#c0c7d0" ' + st() + '/>' +
      dots(holes, 2.2, D) + shine('M37 48 v22');
  }

  function shakerHoles(n) {
    return n === 3 ? [[44, 26], [50, 23], [56, 26]] : [[42, 30], [47, 24], [53, 24], [58, 30], [50, 31]];
  }

  function cutlery(head) {
    return '<g transform="rotate(-30 50 50)">' +
      '<rect x="45" y="44" width="10" height="50" rx="5" fill="#c0c7d0" ' + st() + '/>' + head +
      '</g>';
  }

  function stationCup(body, top) {
    return '<path d="M28 32 h44 l-6 58 h-32z" fill="' + body + '" ' + st() + '/>' + top;
  }

  function bird(body, neck, beak, leg, eye) {
    return line('M44 78 v14 M56 78 v14 M40 92 h8 M52 92 h8', leg, 3.5) +
      '<path d="M14 54 l-8 14 l22 -4z" fill="' + body + '" ' + st() + '/>' +
      '<ellipse cx="46" cy="60" rx="30" ry="20" fill="' + body + '" ' + st() + '/>' +
      '<path d="M30 58 q16 -10 34 4 q-16 10 -34 -4z" fill="' + neck.wing + '" ' + st(2) + '/>' +
      '<circle cx="72" cy="36" r="14" fill="' + body + '" ' + st() + '/>' +
      (neck.patch ? '<path d="M62 44 q10 8 18 0 q-2 10 -10 12 q-8 -2 -8 -12z" fill="' + neck.patch + '"/>' : '') +
      '<path d="M84 32 l12 4 l-12 5z" fill="' + beak + '" ' + st(2) + '/>' +
      '<circle cx="76" cy="33" r="3.5" fill="' + eye + '"/><circle cx="76" cy="33" r="1.6" fill="' + D + '"/>';
  }

  function bag(kind) {
    var c = '#8e5bd9', c2 = '#6a3fb3';
    if (kind === 'backpack') {
      return tube('M38 22 q12 -16 24 0', c2, 4) +
        '<rect x="22" y="20" width="56" height="70" rx="16" fill="' + c + '" ' + st() + '/>' +
        line('M30 28 v54 M70 28 v54', c2, 4) +
        '<rect x="32" y="56" width="36" height="26" rx="8" fill="' + c2 + '" ' + st() + '/>' +
        line('M36 64 h28', '#ffd166', 3);
    }
    return tube('M30 44 q20 -40 40 0', c2, 5) +
      '<path d="M14 44 h72 l-8 44 h-56z" fill="' + c + '" ' + st() + '/>' +
      line('M16 56 h68', c2, 3) +
      '<rect x="44" y="52" width="12" height="9" rx="2" fill="#ffd166" ' + st(2) + '/>';
  }

  function hooked(stick, body) {
    return '<g transform="rotate(14 50 50)">' + tube('M50 92 V26 q0 -16 -12 -16 q-12 0 -12 12', stick, 5) + (body || '') + '</g>';
  }

  /* ---------------------------------------------------------------- */
  /*                           ПРЕДМЕТЫ                               */
  /* ---------------------------------------------------------------- */

  var ITEMS = {
    /* ========================== КУХНЯ ========================== */
    k_mug_red: function () { return mug('#e63946'); },
    k_mug_blue: function () { return mug('#3a86ff'); },
    k_banana: function () {
      return '<path d="M18 22 q2 54 64 56 q8 -1 5 -9 q-48 -4 -55 -47 q-6 -7 -14 0z" fill="#ffd93b" ' + st() + '/>' +
        line('M28 32 q8 30 46 40', '#e0b100', 3) +
        '<path d="M16 22 l1 -8 l8 2 z" fill="#6b4f2a" ' + st(2) + '/>' +
        '<path d="M84 74 l6 2 l-3 4z" fill="#6b4f2a"/>';
    },
    k_corn: function () {
      var k = [];
      for (var y = 18; y <= 66; y += 8) for (var x = -8; x <= 8; x += 8) {
        var w = 15 * Math.sqrt(Math.max(0, 1 - Math.pow((y - 42) / 32, 2)));
        if (Math.abs(x) < w - 4) k.push([50 + x, y]);
      }
      return '<g transform="rotate(35 50 50)">' +
        '<ellipse cx="50" cy="42" rx="15" ry="32" fill="#ffd23f" ' + st() + '/>' +
        dots(k, 3, '#f0a800') +
        '<path d="M50 94 q-28 -10 -22 -50 q6 24 22 32 z" fill="#5cb85c" ' + st() + '/>' +
        '<path d="M50 94 q28 -10 22 -50 q-6 24 -22 32 z" fill="#43a047" ' + st() + '/>' +
        '</g>';
    },
    k_cat: function () { return pet('cat', '#f4a259', '#ffd6a5'); },
    k_dog: function () { return pet('dog', '#d9a066', '#a8743f'); },
    k_clock: function () {
      var ticks = '';
      for (var i = 0; i < 12; i++) { var a = pt(50, 50, 31, i * 30), b = pt(50, 50, i % 3 ? 27 : 24, i * 30); ticks += 'M' + a + ' L' + b + ' '; }
      return '<circle cx="50" cy="50" r="40" fill="#fffdf5" stroke="' + D + '" stroke-width="8"/>' +
        line(ticks, D, 3) + line('M50 50 L50 28 M50 50 L66 58', D, 4) +
        '<circle cx="50" cy="50" r="4" fill="#e63946"/>';
    },
    k_pan: function () {
      return tube('M74 74 L94 94', '#6b4f2a', 7) +
        '<circle cx="46" cy="46" r="40" fill="#3d3d4e" ' + st() + '/>' +
        '<circle cx="46" cy="46" r="31" fill="#56566c"/>' +
        shine('M24 36 q6 -12 18 -16') +
        '<circle cx="90" cy="90" r="3" fill="#fff"/>';
    },
    k_kettle: function () {
      var c = '#2ec4b6';
      return line('M30 38 q20 -30 40 0', D, 6) +
        '<path d="M26 62 l-18 -16 l5 -5 l20 11z" fill="' + c + '" ' + st() + '/>' +
        '<path d="M18 84 q-4 -44 32 -50 q36 6 32 50z" fill="' + c + '" ' + st() + '/>' +
        '<ellipse cx="50" cy="36" rx="12" ry="4" fill="#1f9e92" ' + st(2) + '/>' +
        '<circle cx="50" cy="30" r="4.5" fill="' + D + '"/>' +
        '<rect x="15" y="82" width="70" height="7" rx="3.5" fill="' + D + '"/>' + shine('M30 70 q0 -16 8 -24');
    },
    k_coffeepot: function () {
      var c = '#2ec4b6';
      return line('M70 38 q20 4 16 22 q-4 14 -16 14', D, 6) +
        '<path d="M34 42 l-18 -12 l3 -5 l19 6z" fill="' + c + '" ' + st() + '/>' +
        '<path d="M32 28 h36 l6 60 h-48 z" fill="' + c + '" ' + st() + '/>' +
        '<path d="M29 28 q21 -16 42 0z" fill="#1f9e92" ' + st() + '/>' +
        '<circle cx="50" cy="16" r="4.5" fill="' + D + '"/>' +
        '<rect x="30" y="56" width="40" height="8" fill="#1f9e92"/>' + shine('M38 36 v40');
    },
    k_apple: function () {
      return '<path d="M50 30 q-10 -8 -22 -2 q-16 10 -8 36 q8 24 20 24 q6 0 10 -3 q4 3 10 3 q12 0 20 -24 q8 -26 -8 -36 q-12 -6 -22 2z" fill="#e63946" ' + st() + '/>' +
        line('M50 30 q1 -10 5 -16', '#6b4f2a', 4) +
        '<path d="M56 20 q12 -12 22 -3 q-10 9 -22 3z" fill="#52b788" ' + st(2) + '/>' + shine('M28 46 q0 -8 6 -12');
    },
    k_tomato: function () {
      return '<ellipse cx="50" cy="58" rx="38" ry="29" fill="#e63946" ' + st() + '/>' +
        '<path d="' + star(50, 33, 17, 6, 6) + '" fill="#2d9d4f" ' + st(2) + '/>' +
        line('M50 32 v-10', '#2d9d4f', 4) + shine('M24 52 q2 -10 10 -14');
    },
    k_salt: function () { return shaker('#ffffff', '#d7dde5', shakerHoles(3)); },
    k_pepper: function () { return shaker('#4a4a55', '#22222a', shakerHoles(5)); },
    k_fork: function () {
      return cutlery('<path d="M35 6 v26 q0 16 15 16 q15 0 15 -16 v-26 h-5 v22 h-5 v-22 h-5 v22 h-5 v-22 h-5 v22 h-5 v-22z" fill="#c0c7d0" ' + st(2.5) + '/>');
    },
    k_spoon: function () {
      return cutlery('<ellipse cx="50" cy="26" rx="15" ry="21" fill="#c0c7d0" ' + st() + '/>' + shine('M43 18 q2 -6 6 -8'));
    },
    k_lemon: function () {
      return '<path d="M8 50 q8 -3 12 -8 q30 -26 60 0 q4 5 12 8 q-8 3 -12 8 q-30 26 -60 0 q-4 -5 -12 -8z" fill="#ffe14d" ' + st() + '/>' +
        dots([[36, 44], [50, 40], [62, 48], [44, 56], [58, 58]], 1.4, '#e6c200') + shine('M30 44 q8 -8 18 -8');
    },
    k_orange: function () {
      return '<circle cx="50" cy="54" r="35" fill="#fb8b24" ' + st() + '/>' +
        dots([[36, 46], [50, 40], [64, 50], [42, 64], [58, 68], [70, 62]], 1.4, '#d96f0e') +
        '<path d="M50 20 q10 -14 22 -8 q-8 10 -22 8z" fill="#52b788" ' + st(2) + '/>' + shine('M26 48 q2 -12 12 -18');
    },
    k_cheese: function () {
      return '<path d="M10 48 L88 26 L90 78 L10 78z" fill="#ffc94a" ' + st() + '/>' +
        '<path d="M10 48 L88 26 L90 38 L12 58z" fill="#ffe08a" ' + st(2) + '/>' +
        dots([[30, 68], [52, 56], [70, 66], [80, 48], [44, 72]], 4.5, '#e6a92e');
    },
    k_bread: function () {
      return '<path d="M10 76 q-6 -46 40 -46 q46 0 40 46 z" fill="#d4934a" ' + st() + '/>' +
        line('M28 52 l10 -10 M46 48 l10 -10 M64 52 l10 -10', '#a8682b', 4) +
        '<rect x="10" y="74" width="80" height="12" rx="4" fill="#b8742f" ' + st() + '/>';
    },
    k_carrot: function () {
      return line('M34 26 q-16 -14 -10 -22 M38 22 q-2 -16 8 -20 M40 26 q8 -14 18 -10', '#2d9d4f', 6) +
        '<path d="M28 32 L80 88 q5 2 3 -4 L44 22 q-12 -3 -16 10z" fill="#f77f00" ' + st() + '/>' +
        line('M44 42 l8 -4 M56 56 l8 -4 M66 70 l6 -3', '#c25e00', 3);
    },
    k_plant: function () {
      return '<ellipse cx="38" cy="38" rx="9" ry="22" fill="#52b788" ' + st() + ' transform="rotate(-30 38 38)"/>' +
        '<ellipse cx="62" cy="38" rx="9" ry="22" fill="#40916c" ' + st() + ' transform="rotate(30 62 38)"/>' +
        '<ellipse cx="50" cy="30" rx="9" ry="24" fill="#74c69d" ' + st() + '/>' +
        '<path d="M28 62 h44 l-7 30 h-30z" fill="#c8553d" ' + st() + '/>' +
        '<rect x="24" y="56" width="52" height="10" rx="3" fill="#e07a5f" ' + st() + '/>';
    },
    k_rollingpin: function () {
      return '<g transform="rotate(-25 50 50)">' +
        '<rect x="4" y="45" width="18" height="10" rx="5" fill="#b07d4f" ' + st() + '/>' +
        '<rect x="78" y="45" width="18" height="10" rx="5" fill="#b07d4f" ' + st() + '/>' +
        '<rect x="20" y="36" width="60" height="28" rx="8" fill="#e8bd88" ' + st() + '/>' +
        shine('M28 43 h40') + '</g>';
    },
    k_egg: function () {
      return '<path d="M50 12 q30 0 30 46 q0 30 -30 30 q-30 0 -30 -30 q0 -46 30 -46z" fill="#fff8e7" ' + st() + '/>' +
        shine('M34 44 q2 -14 10 -20');
    },

    /* ========================== ПЛЯЖ ========================== */
    b_ball: function () {
      return '<circle cx="50" cy="50" r="40" fill="#fff"/>' +
        sectors(50, 50, 40, 0, ['#e63946', '#fff', '#3a86ff', '#fff', '#ffd23f', '#fff'], 20) +
        '<circle cx="50" cy="50" r="40" fill="none" ' + st() + '/><circle cx="50" cy="50" r="6" fill="#fff" ' + st(2) + '/>' +
        shine('M24 38 q6 -14 18 -18');
    },
    b_ring: function () {
      return sectors(50, 50, 42, 20, ['#e63946', '#fff', '#e63946', '#fff', '#e63946', '#fff', '#e63946', '#fff'], 22.5) +
        '<circle cx="50" cy="50" r="42" fill="none" ' + st() + '/><circle cx="50" cy="50" r="20" fill="none" ' + st() + '/>' +
        line('M50 8 q28 2 40 22 M92 50 q-2 28 -22 40 M50 92 q-28 -2 -40 -22 M8 50 q2 -28 22 -40', '#f2e3c6', 2);
    },
    b_sunglasses: function () {
      return line('M8 40 l-4 -12 M92 40 l4 -12', D, 4) +
        '<path d="M8 38 h36 q0 26 -18 26 q-18 0 -18 -26z" fill="' + D + '" ' + st() + '/>' +
        '<path d="M56 38 h36 q0 26 -18 26 q-18 0 -18 -26z" fill="' + D + '" ' + st() + '/>' +
        line('M44 40 q6 -6 12 0', D, 4) + shine('M16 44 l8 8 M64 44 l8 8');
    },
    b_goggles: function () {
      return line('M4 50 h92', '#3a86ff', 8) +
        '<ellipse cx="29" cy="50" rx="20" ry="15" fill="#8ecae6" stroke="#ff9f1c" stroke-width="5"/>' +
        '<ellipse cx="71" cy="50" rx="20" ry="15" fill="#8ecae6" stroke="#ff9f1c" stroke-width="5"/>' +
        '<ellipse cx="29" cy="50" rx="23" ry="18" fill="none" ' + st(2) + '/><ellipse cx="71" cy="50" rx="23" ry="18" fill="none" ' + st(2) + '/>' +
        line('M49 50 h2', D, 6) + shine('M20 46 l6 6 M62 46 l6 6');
    },
    b_icecream: function () {
      return '<path d="M30 50 L50 94 L70 50z" fill="#e9b872" ' + st() + '/>' +
        line('M38 58 l20 20 M46 54 l18 18 M62 58 l-20 20 M54 54 l-18 18', '#c8913f', 2) +
        '<circle cx="50" cy="36" r="22" fill="#ff8fab" ' + st() + '/>' +
        '<path d="M28 44 q6 10 12 2 q6 10 12 2 q6 10 12 2 q6 8 10 -2" fill="#ff8fab" ' + st() + '/>' +
        '<circle cx="56" cy="14" r="6" fill="#e63946" ' + st(2) + '/>' + shine('M38 26 q4 -6 10 -8');
    },
    b_popsicle: function () {
      return '<rect x="44" y="70" width="12" height="26" rx="5" fill="#e9c891" ' + st() + '/>' +
        '<path d="M26 76 V30 q0 -24 24 -24 q24 0 24 24 V76z" fill="#ff8fab" ' + st() + '/>' +
        '<path d="M26 52 h48 v24 h-48z" fill="#ff5d8f" ' + st() + '/>' + shine('M34 22 v22');
    },
    b_crab: function () {
      return line('M28 62 l-18 6 M28 68 l-16 14 M72 62 l18 6 M72 68 l16 14 M34 72 l-8 16 M66 72 l8 16', D, 4) +
        line('M30 52 L18 34 M70 52 L82 34', '#e63946', 6) +
        '<path d="M18 36 q-14 -8 -6 -22 q4 8 10 6 q2 -8 10 -6 q2 14 -14 22z" fill="#e63946" ' + st() + '/>' +
        '<path d="M82 36 q14 -8 6 -22 q-4 8 -10 6 q-2 -8 -10 -6 q-2 14 14 22z" fill="#e63946" ' + st() + '/>' +
        '<ellipse cx="50" cy="62" rx="28" ry="18" fill="#e63946" ' + st() + '/>' +
        line('M42 46 v-10 M58 46 v-10', D, 3) +
        '<circle cx="42" cy="34" r="5" fill="#fff" ' + st(2) + '/><circle cx="58" cy="34" r="5" fill="#fff" ' + st(2) + '/>' +
        '<circle cx="42" cy="34" r="2" fill="' + D + '"/><circle cx="58" cy="34" r="2" fill="' + D + '"/>' +
        line('M42 68 q8 6 16 0', D, 3);
    },
    b_starfish: function () {
      return '<path d="' + star(50, 54, 44, 18, 5) + '" fill="#ff7b54" ' + st() + '/>' +
        dots([[50, 30], [50, 40], [30, 50], [70, 50], [38, 72], [62, 72], [50, 56]], 2.5, '#ffd6a5');
    },
    b_seagull: function () {
      return '<path d="M4 44 q22 -24 44 4 q24 -28 46 -4 q-22 -8 -42 18 q-26 -26 -48 -18z" fill="#fff" ' + st() + '/>' +
        '<path d="M4 44 q8 -9 16 -9 l-4 8z M94 40 q-8 -9 -16 -8 l4 8z" fill="#8d99ae"/>' +
        '<ellipse cx="50" cy="62" rx="12" ry="7" fill="#fff" ' + st() + '/>' +
        '<path d="M60 60 l10 2 l-10 3z" fill="#ffb703" ' + st(1.5) + '/>' +
        '<circle cx="55" cy="59" r="1.8" fill="' + D + '"/>';
    },
    b_plane: function () {
      return '<path d="M44 52 l-12 30 h10 l20 -30z" fill="#e0e6f0" ' + st() + '/>' +
        '<path d="M14 30 l8 22 h10 l-6 -22z" fill="#e63946" ' + st() + '/>' +
        '<path d="M10 52 q0 -10 14 -10 h56 q14 0 14 10 q0 10 -14 10 h-56 q-14 0 -14 -10z" fill="#fff" ' + st() + '/>' +
        '<path d="M44 52 l-6 -26 h10 l16 26z" fill="#e0e6f0" ' + st() + '/>' +
        dots([[40, 50], [50, 50], [60, 50], [70, 50]], 2.6, '#3a86ff') +
        '<path d="M80 46 q10 0 12 6 h-12z" fill="#3a86ff"/>';
    },
    b_flipflop: function () {
      return '<g transform="rotate(-18 50 50)">' +
        '<path d="M50 6 q24 0 24 30 q0 26 -7 42 q-6 16 -17 16 q-11 0 -17 -16 q-7 -16 -7 -42 q0 -30 24 -30z" fill="#ff5d8f" ' + st() + '/>' +
        '<path d="M50 12 q16 0 17 24 q0 20 -5 34 q-5 14 -12 14 q-7 0 -12 -14 q-5 -14 -5 -34 q1 -24 17 -24z" fill="#ffc2d4"/>' +
        tube('M30 56 L50 26 L70 56', '#3a86ff', 5) + '<circle cx="50" cy="26" r="4" fill="#3a86ff" ' + st(2) + '/></g>';
    },
    b_flipper: function () {
      return '<g transform="rotate(-18 50 50)">' +
        '<path d="M36 6 h28 q8 0 8 12 v18 l20 50 q-42 12 -84 0 l20 -50 v-18 q0 -12 8 -12z" fill="#ff5d8f" ' + st() + '/>' +
        line('M30 50 l-10 34 M50 46 v42 M70 50 l10 34', '#d63a6c', 3) +
        '<path d="M36 10 h28 q4 0 4 8 v18 h-36 v-18 q0 -8 4 -8z" fill="#3a86ff" ' + st(2) + '/></g>';
    },
    b_palm: function () {
      return '<path d="M44 94 q-8 -34 6 -60 h8 q-10 30 -2 60 z" fill="#a5672e" ' + st() + '/>' +
        line('M46 80 h10 M47 68 h10 M49 56 h10 M51 44 h9', '#7a4a1f', 2) +
        '<path d="M54 34 q-24 -20 -48 -2 q24 -6 48 2z" fill="#2d9d4f" ' + st(2.5) + '/>' +
        '<path d="M54 34 q22 -22 44 -2 q-24 -6 -44 2z" fill="#40916c" ' + st(2.5) + '/>' +
        '<path d="M54 34 q-10 -24 -30 -30 q16 12 30 30z" fill="#52b788" ' + st(2.5) + '/>' +
        '<path d="M54 34 q8 -26 30 -30 q-18 12 -30 30z" fill="#52b788" ' + st(2.5) + '/>' +
        '<path d="M54 34 q-20 2 -28 24 q12 -18 28 -24z" fill="#40916c" ' + st(2.5) + '/>' +
        '<circle cx="50" cy="38" r="5" fill="#6b4f2a" ' + st(2) + '/><circle cx="59" cy="39" r="5" fill="#6b4f2a" ' + st(2) + '/>';
    },
    b_pineapple: function () {
      return '<path d="M50 30 l-14 -22 l10 8 l4 -14 l4 14 l10 -8z" fill="#2d9d4f" ' + st(2.5) + '/>' +
        '<path d="M50 32 l-20 -6 l10 10z M50 32 l20 -6 l-10 10z" fill="#40916c" ' + st(2.5) + '/>' +
        '<ellipse cx="50" cy="62" rx="22" ry="30" fill="#f4c430" ' + st() + '/>' +
        line('M34 44 l28 34 M30 58 l20 26 M42 36 l24 30 M66 44 l-28 34 M70 58 l-20 26 M58 36 l-24 30', '#c8941f', 2.5);
    },
    b_watermelon: function () {
      return '<path d="M8 24 h84 l-5 12 h-74z" fill="#2d9d4f" ' + st() + '/>' +
        '<path d="M13 36 h74 L50 94z" fill="#ff4d6d" ' + st() + '/>' +
        dots([[36, 48], [50, 46], [64, 48], [44, 60], [56, 60], [50, 74]], 2.6, D);
    },
    b_pizza: function () {
      return '<path d="M8 24 h84 l-5 12 h-74z" fill="#c8813f" ' + st() + '/>' +
        '<path d="M13 36 h74 L50 94z" fill="#ffd166" ' + st() + '/>' +
        dots([[36, 48], [62, 50], [50, 68]], 6, '#e63946') + dots([[48, 46], [56, 60], [40, 58]], 1.6, '#2d9d4f');
    },
    b_bucket: function () {
      return line('M24 36 q26 -36 52 0', D, 4) +
        '<path d="M22 36 h56 l-8 54 h-40z" fill="#ffbe0b" ' + st() + '/>' +
        '<ellipse cx="50" cy="36" rx="28" ry="6" fill="#e0a100" ' + st() + '/>' +
        line('M26 54 h48', '#e63946', 6);
    },
    b_spade: function () {
      return '<g transform="rotate(25 50 50)">' + tube('M50 4 v54', '#3a86ff', 5) +
        '<path d="M44 6 h12 v8 h-12z" fill="#3a86ff" ' + st(2) + '/>' +
        '<path d="M34 56 h32 v18 q0 18 -16 22 q-16 -4 -16 -22z" fill="#3a86ff" ' + st() + '/></g>';
    },
    b_sandcastle: function () {
      return line('M50 20 v-16', D, 3) + '<path d="M50 4 l14 5 l-14 5z" fill="#e63946"/>' +
        '<path d="M14 92 v-34 h8 v-6 h6 v6 h8 v-6 h6 v6 h4 v-26 h6 v-6 h4 v6 h4 v-6 h4 v6 h-2 v26 h4 v-6 h6 v6 h8 v-6 h6 v6 h8 v34z" fill="#f2cc8f" ' + st() + '/>' +
        '<path d="M44 92 v-14 q6 -8 12 0 v14z" fill="#a5672e" ' + st(2) + '/>';
    },
    b_shell: function () {
      return '<path d="M50 88 L14 46 q-2 -32 36 -36 q38 4 36 36z" fill="#ffafcc" ' + st() + '/>' +
        line('M50 88 L26 22 M50 88 L38 14 M50 88 V10 M50 88 L62 14 M50 88 L74 22', '#e5739a', 2.5) +
        '<path d="M40 88 h20 l-4 8 h-12z" fill="#ffafcc" ' + st(2) + '/>';
    },
    b_boat: function () {
      return line('M48 70 V8', D, 4) +
        '<path d="M52 10 q30 26 30 54 h-30z" fill="#fff" ' + st() + '/>' +
        '<path d="M44 18 q-18 24 -22 46 h22z" fill="#ffd166" ' + st() + '/>' +
        '<path d="M8 70 h84 l-12 20 h-60z" fill="#e63946" ' + st() + '/>' + line('M16 78 h68', '#fff', 3);
    },
    b_umbrella: function () {
      return line('M50 30 L56 96', '#7a4a1f', 5) +
        '<path d="M6 46 q44 -60 88 0z" fill="#fff" ' + st() + '/>' +
        '<path d="M6 46 q8 -26 22 -36 q-6 18 -2 36z M50 6 q-10 20 -8 40 h16 q2 -20 -8 -40z M94 46 q-8 -26 -22 -36 q6 18 2 36z" fill="#ff6b6b"/>' +
        '<path d="M6 46 q44 -60 88 0z" fill="none" ' + st() + '/>';
    },
    b_towel: function () {
      return '<g transform="rotate(-12 50 50)">' +
        '<rect x="16" y="10" width="68" height="80" rx="4" fill="#4cc9f0" ' + st() + '/>' +
        '<rect x="16" y="26" width="68" height="10" fill="#fff"/><rect x="16" y="64" width="68" height="10" fill="#fff"/>' +
        '<rect x="16" y="45" width="68" height="10" fill="#f72585"/>' +
        '<rect x="16" y="10" width="68" height="80" rx="4" fill="none" ' + st() + '/></g>';
    },
    b_sun: function () {
      var rays = '';
      for (var i = 0; i < 12; i++) { var a = pt(50, 50, 32, i * 30), b = pt(50, 50, 46, i * 30); rays += 'M' + a + ' L' + b + ' '; }
      return line(rays, '#ffb703', 6) + '<circle cx="50" cy="50" r="26" fill="#ffd23f" ' + st() + '/>' +
        '<circle cx="42" cy="46" r="2.5" fill="' + D + '"/><circle cx="58" cy="46" r="2.5" fill="' + D + '"/>' +
        line('M42 57 q8 7 16 0', D, 3);
    },

    /* ========================== ВОКЗАЛ ========================== */
    s_suitcase: function () {
      var c = '#a0643c';
      return line('M40 24 v-12 h20 v12', D, 6) +
        '<rect x="24" y="22" width="52" height="62" rx="8" fill="' + c + '" ' + st() + '/>' +
        line('M38 24 v58 M62 24 v58', '#6e4122', 5) +
        '<circle cx="32" cy="90" r="5" fill="' + D + '"/><circle cx="68" cy="90" r="5" fill="' + D + '"/>' +
        '<rect x="44" y="48" width="12" height="8" rx="2" fill="#ffd166" ' + st(2) + '/>';
    },
    s_briefcase: function () {
      var c = '#a0643c';
      return line('M40 34 v-12 h20 v12', D, 6) +
        '<rect x="8" y="32" width="84" height="52" rx="7" fill="' + c + '" ' + st() + '/>' +
        line('M10 50 h80', '#6e4122', 4) +
        '<rect x="44" y="45" width="12" height="11" rx="2" fill="#ffd166" ' + st(2) + '/>';
    },
    s_ticket: function () {
      return '<g transform="rotate(-8 50 50)"><path d="M8 26 h84 v18 q-8 6 0 12 v18 h-84 v-18 q8 -6 0 -12z" fill="#ffd6a5" ' + st() + '/>' +
        line('M70 28 v44', D, 2) +
        line('M18 40 h28 M18 50 h40 M18 60 h22', '#a0643c', 4) +
        '<path d="M76 42 h8 l-4 -4 M84 42 l-4 4 M76 58 h8" fill="none" stroke="' + D + '" stroke-width="2.5" stroke-linecap="round"/></g>';
    },
    s_banknote: function () {
      return '<g transform="rotate(-8 50 50)"><rect x="8" y="26" width="84" height="48" rx="3" fill="#95d5b2" ' + st() + '/>' +
        '<rect x="14" y="32" width="72" height="36" rx="2" fill="none" stroke="#2d6a4f" stroke-width="2"/>' +
        '<circle cx="36" cy="50" r="11" fill="#d8f3dc" stroke="#2d6a4f" stroke-width="2.5"/>' +
        '<circle cx="36" cy="47" r="4" fill="#2d6a4f"/><path d="M29 57 q7 -8 14 0" fill="#2d6a4f"/>' +
        '<text x="68" y="57" font-family="Arial, sans-serif" font-weight="900" font-size="18" text-anchor="middle" fill="#2d6a4f">100</text></g>';
    },
    s_newspaper: function () {
      return '<g transform="rotate(6 50 50)"><rect x="12" y="12" width="76" height="76" fill="#f4f1ea" ' + st() + '/>' +
        '<rect x="18" y="18" width="64" height="10" fill="' + D + '"/>' +
        '<rect x="18" y="34" width="28" height="22" fill="#adb5bd"/>' +
        line('M52 36 h30 M52 44 h30 M52 52 h30 M18 64 h64 M18 72 h64 M18 80 h44', '#868e96', 3) + '</g>';
    },
    s_book: function () {
      return '<path d="M6 30 q22 -8 44 2 q22 -10 44 -2 v56 q-22 -8 -44 2 q-22 -10 -44 -2z" fill="#3a5a9b" ' + st() + '/>' +
        '<path d="M50 28 q-18 -10 -40 -2 v52 q22 -6 40 4z" fill="#f4f1ea" ' + st() + '/>' +
        '<path d="M50 28 q18 -10 40 -2 v52 q-22 -6 -40 4z" fill="#f4f1ea" ' + st() + '/>' +
        line('M16 38 q14 -4 28 2 M16 48 q14 -4 28 2 M16 58 q14 -4 28 2 M56 40 q14 -6 28 -2 M56 50 q14 -6 28 -2 M56 60 q14 -6 28 -2', '#868e96', 2.5);
    },
    s_umbrella: function () {
      return hooked('#3d3d4e', '<path d="M50 30 l9 48 q-9 6 -18 0z" fill="#3a0ca3" ' + st() + '/>' + line('M46 38 l4 36', '#7209b7', 2));
    },
    s_cane: function () {
      return hooked('#a5672e', '<rect x="46" y="86" width="8" height="6" fill="' + D + '"/>');
    },
    s_hat: function () {
      var c = '#4a4e69';
      return '<ellipse cx="50" cy="72" rx="44" ry="12" fill="' + c + '" ' + st() + '/>' +
        '<path d="M24 72 q-2 -44 26 -44 q28 0 26 44z" fill="' + c + '" ' + st() + '/>' +
        '<path d="M25 60 q25 6 50 0 l1 9 q-26 6 -52 0z" fill="#22223b"/>';
    },
    s_cap: function () {
      var c = '#4a4e69';
      return '<path d="M64 66 q24 -4 32 8 q-16 8 -34 2z" fill="#22223b" ' + st() + '/>' +
        '<path d="M16 70 q0 -42 34 -42 q32 0 32 42z" fill="' + c + '" ' + st() + '/>' +
        line('M50 30 v38 M32 36 q-8 14 -6 32 M68 36 q8 14 6 32', '#22223b', 2) +
        '<circle cx="50" cy="28" r="4" fill="#22223b" ' + st(2) + '/>';
    },
    s_pigeon: function () { return bird('#a5a9b4', { wing: '#868b98', patch: '#6c9a8b' }, '#3d3d4e', '#e5737f', '#ff9f1c'); },
    s_crow: function () { return bird('#2b2b36', { wing: '#3d3d4e', patch: null }, '#11111a', '#11111a', '#ffffff'); },
    s_coffee: function () {
      return stationCup('#fff', '<rect x="30" y="50" width="40" height="18" fill="#a0643c"/>' +
        '<rect x="24" y="24" width="52" height="10" rx="4" fill="#6b4f2a" ' + st() + '/>' +
        '<path d="M34 24 q2 -8 16 -8 q14 0 16 8z" fill="#6b4f2a" ' + st() + '/>' +
        '<path d="M28 32 h44 l-6 58 h-32z" fill="none" ' + st() + '/>');
    },
    s_soda: function () {
      return line('M54 22 L66 4', '#2ec4b6', 5) + stationCup('#e63946', '<path d="M31 50 h38 l-1 12 h-36z" fill="#fff"/>' +
        '<rect x="24" y="24" width="52" height="10" rx="4" fill="#fff" ' + st() + '/>' +
        '<path d="M28 32 h44 l-6 58 h-32z" fill="none" ' + st() + '/>');
    },
    s_backpack: function () { return bag('backpack'); },
    s_handbag: function () { return bag('handbag'); },
    s_clock: function () {
      var ticks = '';
      for (var i = 0; i < 12; i++) { var a = pt(50, 56, 28, i * 30), b = pt(50, 56, 23, i * 30); ticks += 'M' + a + ' L' + b + ' '; }
      return '<rect x="44" y="4" width="12" height="16" fill="#6c757d" ' + st() + '/>' +
        '<circle cx="50" cy="56" r="38" fill="#fff" stroke="#22223b" stroke-width="7"/>' +
        line(ticks, D, 3) + line('M50 56 L50 34 M50 56 L64 48', D, 4) + line('M50 56 L36 74', '#e63946', 2) +
        '<circle cx="50" cy="56" r="3.5" fill="' + D + '"/>';
    },
    s_bench: function () {
      return line('M20 58 v32 M80 58 v32', D, 6) +
        '<rect x="8" y="22" width="84" height="10" rx="3" fill="#bc6c25" ' + st() + '/>' +
        '<rect x="8" y="36" width="84" height="10" rx="3" fill="#bc6c25" ' + st() + '/>' +
        '<rect x="4" y="54" width="92" height="10" rx="3" fill="#dda15e" ' + st() + '/>' + line('M20 32 v22 M80 32 v22', D, 5);
    },
    s_bin: function () {
      return '<path d="M24 30 h52 l-6 60 h-40z" fill="#2a9d8f" ' + st() + '/>' +
        '<rect x="20" y="20" width="60" height="12" rx="4" fill="#21867a" ' + st() + '/>' +
        line('M38 42 l2 38 M50 42 v38 M62 42 l-2 38', '#21867a', 4) +
        '<path d="M36 20 q2 -10 8 -6 l6 -8 l6 10z" fill="#ffd166" ' + st(2) + '/>';
    },
    s_semaphore: function () {
      return line('M50 84 v12', D, 6) + '<rect x="30" y="4" width="40" height="82" rx="10" fill="#343a40" ' + st() + '/>' +
        '<circle cx="50" cy="22" r="10" fill="#e63946" ' + st(2) + '/>' +
        '<circle cx="50" cy="45" r="10" fill="#6c5b2a" ' + st(2) + '/>' +
        '<circle cx="50" cy="68" r="10" fill="#3a5f46" ' + st(2) + '/>' + shine('M45 18 q2 -3 5 -3');
    },
    s_phone: function () {
      return '<rect x="28" y="8" width="44" height="84" rx="8" fill="#22223b" ' + st() + '/>' +
        '<rect x="33" y="18" width="34" height="62" rx="2" fill="#4cc9f0"/>' +
        '<rect x="37" y="24" width="12" height="12" rx="3" fill="#fff" opacity=".8"/><rect x="51" y="24" width="12" height="12" rx="3" fill="#ffd166"/>' +
        '<rect x="37" y="40" width="12" height="12" rx="3" fill="#f72585"/><rect x="51" y="40" width="12" height="12" rx="3" fill="#fff" opacity=".8"/>' +
        '<circle cx="50" cy="86" r="3" fill="#6c757d"/>';
    },
    s_guitar: function () {
      return '<g transform="rotate(30 50 50)">' + '<rect x="45" y="2" width="10" height="44" fill="#6b4f2a" ' + st() + '/>' +
        '<rect x="42" y="0" width="16" height="10" rx="3" fill="#3d2a17" ' + st(2) + '/>' +
        '<path d="M50 42 q-16 -4 -18 10 q-2 8 4 12 q-12 6 -10 18 q4 16 24 16 q20 0 24 -16 q2 -12 -10 -18 q6 -4 4 -12 q-2 -14 -18 -10z" fill="#f4a259" ' + st() + '/>' +
        '<circle cx="50" cy="70" r="7" fill="#3d2a17"/>' + line('M48 8 v76 M52 8 v76', '#eee', 1) + '</g>';
    },
    s_flowers: function () {
      return line('M44 50 l-6 -16 M50 50 v-20 M56 50 l8 -18', '#2d9d4f', 4) +
        '<circle cx="36" cy="28" r="10" fill="#f72585" ' + st(2.5) + '/><circle cx="50" cy="20" r="10" fill="#ffd166" ' + st(2.5) + '/>' +
        '<circle cx="65" cy="28" r="10" fill="#ff6b6b" ' + st(2.5) + '/>' +
        dots([[36, 28], [50, 20], [65, 28]], 3.5, '#fff') +
        '<path d="M28 44 h44 l-16 50 h-12z" fill="#e9c46a" ' + st() + '/>' + line('M40 60 h20', '#e63946', 5);
    },
    s_bicycle: function () {
      return '<circle cx="24" cy="64" r="18" fill="none" ' + st(4) + '/><circle cx="76" cy="64" r="18" fill="none" ' + st(4) + '/>' +
        line('M24 64 L40 38 L66 38 L76 64 M40 38 L50 64 L66 38 M50 64 L24 64', '#e63946', 4) +
        line('M40 38 l-4 -8 h-8 M66 38 l-2 -12 h10', D, 4) + '<circle cx="50" cy="64" r="4" fill="' + D + '"/>';
    }
  };

  /* ---------------------------------------------------------------- */
  /*                         ФОНЫ СЦЕН (1600×900)                     */
  /* ---------------------------------------------------------------- */

  var BACKGROUNDS = {
    kitchen: function () {
      var tiles = '';
      for (var x = 0; x < 1600; x += 80) for (var y = 0; y < 600; y += 80) {
        if ((x / 80 + y / 80) % 2 === 0) tiles += '<rect x="' + x + '" y="' + y + '" width="80" height="80" fill="#ffeed9"/>';
      }
      return '<rect width="1600" height="900" fill="#fff6ea"/>' + tiles +
        '<rect x="0" y="222" width="1600" height="16" fill="#c8915a" stroke="' + D + '" stroke-width="3"/>' +
        '<rect x="0" y="426" width="1600" height="16" fill="#c8915a" stroke="' + D + '" stroke-width="3"/>' +
        '<rect x="0" y="622" width="1600" height="26" fill="#e9c46a" stroke="' + D + '" stroke-width="3"/>' +
        '<rect x="0" y="648" width="1600" height="252" fill="#8ab17d"/>' +
        [0, 400, 800, 1200].map(function (x) {
          return '<rect x="' + (x + 14) + '" y="664" width="372" height="220" rx="10" fill="#a3c494" stroke="#5e8a52" stroke-width="3"/>';
        }).join('');
    },
    beach: function () {
      return '<defs><linearGradient id="skyg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fd3ff"/><stop offset="1" stop-color="#d6f1ff"/></linearGradient></defs>' +
        '<rect width="1600" height="230" fill="url(#skyg)"/>' +
        '<ellipse cx="300" cy="60" rx="90" ry="22" fill="#fff" opacity=".8"/><ellipse cx="1150" cy="40" rx="110" ry="24" fill="#fff" opacity=".8"/>' +
        '<rect y="230" width="1600" height="250" fill="#2a9df4"/>' +
        '<path d="M0 260 q40 -14 80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0" fill="none" stroke="#9ed8ff" stroke-width="4"/>' +
        '<path d="M0 400 q40 -14 80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0" fill="none" stroke="#9ed8ff" stroke-width="4"/>' +
        '<path d="M0 470 q100 -30 200 0 t200 0 t200 0 t200 0 t200 0 t200 0 t200 0 t200 0 V900 H0z" fill="#f6d79b"/>' +
        '<path d="M0 470 q100 -30 200 0 t200 0 t200 0 t200 0 t200 0 t200 0 t200 0 t200 0" fill="none" stroke="#fff" stroke-width="8"/>' +
        dots([[120, 600], [480, 700], [820, 640], [1260, 720], [1500, 610], [300, 860], [1000, 870]], 4, '#e3b874');
    },
    station: function () {
      var arches = '';
      for (var i = 0; i < 4; i++) {
        var x = 30 + i * 400;
        arches += '<path d="M' + x + ' 520 V160 q170 -150 340 0 V520z" fill="#cfe8f7" stroke="#7d8597" stroke-width="6"/>' +
          '<path d="M' + (x + 170) + ' 40 V520 M' + x + ' 300 H' + (x + 340) + '" stroke="#7d8597" stroke-width="4"/>';
      }
      return '<rect width="1600" height="900" fill="#e9e3d6"/>' + arches +
        '<rect y="520" width="1600" height="30" fill="#7d8597"/>' +
        '<rect y="550" width="1600" height="350" fill="#b8b2a7"/>' +
        '<rect y="860" width="1600" height="14" fill="#ffd166"/>' +
        '<path d="M0 640 H1600 M0 760 H1600" stroke="#a39d92" stroke-width="3"/>';
    }
  };

  /* ---------------------------------------------------------------- */
  /*                               API                                */
  /* ---------------------------------------------------------------- */

  // Нарисованные картинки (нарезка листов) имеют приоритет над SVG
  var IMAGES = {};
  (root.ART_IMAGES || []).forEach(function (id) { IMAGES[id] = true; });

  function itemInner(id) {
    if (IMAGES[id]) return '<image href="/img/items/' + id + '.png" x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMid meet"/>';
    var f = ITEMS[id];
    return f ? f() : '<text x="50" y="55" text-anchor="middle">?</text>';
  }

  function itemSvg(id, cls) {
    return '<svg class="' + (cls || 'item-svg') + '" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + itemInner(id) + '</svg>';
  }

  /** Сцена целиком. opts.clickable — data-атрибуты для тапа. */
  function sceneSvg(scene, opts) {
    opts = opts || {};
    var out = '<svg class="scene-svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">' +
      '<defs><filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="0" stdDeviation="10" flood-color="#ffd60a" flood-opacity="1"/></filter></defs>' +
      ((root.ART_BACKGROUNDS || []).indexOf(scene.id) >= 0
        ? '<image href="/img/bg/' + scene.id + '.jpg" x="0" y="0" width="1600" height="900" preserveAspectRatio="xMidYMid slice"/>'
        : (BACKGROUNDS[scene.id] ? BACKGROUNDS[scene.id]() : ''));
    scene.items.forEach(function (it) {
      var s = it.size || 150, x = it.x - s / 2, y = it.y - s / 2;
      var bx = x + 10, by = y + 12;
      out += '<g id="item-' + it.id + '" class="scene-item" data-item="' + it.id + '" data-num="' + it.num + '">' +
        '<rect class="hit" x="' + x + '" y="' + y + '" width="' + s + '" height="' + s + '" rx="24" fill="transparent"/>' +
        '<svg x="' + x + '" y="' + y + '" width="' + s + '" height="' + s + '" viewBox="0 0 100 100" overflow="visible">' + itemInner(it.id) + '</svg>' +
        '<circle cx="' + bx + '" cy="' + by + '" r="21" fill="#fff" stroke="' + D + '" stroke-width="4"/>' +
        '<text x="' + bx + '" y="' + (by + 8) + '" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="23" fill="' + D + '">' + it.num + '</text>' +
        '</g>';
    });
    return out + '</svg>';
  }

  var api = { ITEMS: ITEMS, BACKGROUNDS: BACKGROUNDS, itemInner: itemInner, itemSvg: itemSvg, sceneSvg: sceneSvg,
    // помощники рисования — для дополнительных наборов предметов (art2.js)
    h: { D: D, st: st, line: line, tube: tube, pt: pt, sectors: sectors, star: star, dots: dots, shine: shine } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ART = api;
})(this);

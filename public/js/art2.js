/*
 * Дополнительные сцены: «Офис», «Парк», «Космос» — по 24 предмета в SVG,
 * тот же стиль и та же система координат 100×100, что в art.js.
 * Подключается после art.js и дописывает предметы и фоны в window.ART.
 */
(function (root) {
  'use strict';
  var ART = root.ART || (typeof require !== 'undefined' ? require('./art.js') : null);
  var H = ART.h, D = H.D, st = H.st, line = H.line, tube = H.tube, dots = H.dots, shine = H.shine, sectors = H.sectors, star = H.star;

  /* ------------ «родственники» для пар ------------ */
  function writer(body, tip, cap) {
    return '<g transform="rotate(35 50 50)">' +
      '<path d="M44 14 h12 v62 l-6 14 l-6 -14z" fill="' + body + '" ' + st() + '/>' + tip + (cap || '') + '</g>';
  }
  function screen(base) {
    return '<rect x="12" y="16" width="76" height="50" rx="5" fill="#22223b" ' + st() + '/>' +
      '<rect x="17" y="21" width="66" height="40" rx="2" fill="#4cc9f0"/>' +
      '<path d="M22 54 l14 -14 l10 8 l12 -16 l20 22z" fill="#90e0ef"/><circle cx="30" cy="32" r="5" fill="#ffd166"/>' + base;
  }
  function potPlant(top) {
    return top + '<path d="M30 64 h40 l-6 26 h-28z" fill="#e07a5f" ' + st() + '/><rect x="26" y="58" width="48" height="9" rx="3" fill="#c8553d" ' + st() + '/>';
  }
  function cupBox(color, top) {
    return top + '<path d="M26 40 h48 l-4 48 h-40z" fill="' + color + '" ' + st() + '/>' + shine('M33 48 v30');
  }
  function sheetBoard(top, color) {
    return '<rect x="20" y="12" width="60" height="78" rx="5" fill="' + color + '" ' + st() + '/>' +
      '<rect x="27" y="22" width="46" height="60" rx="2" fill="#fff" ' + st(2) + '/>' +
      line('M33 36 h34 M33 46 h34 M33 56 h26 M33 66 h30', '#adb5bd', 3) + top;
  }
  function bird(neckLong, color, beak) {
    var neck = neckLong ? '<path d="M64 52 q-6 -26 8 -34 q10 -4 12 6 q-12 2 -10 30z" fill="' + color + '" ' + st() + '/>' :
      '<circle cx="72" cy="38" r="13" fill="' + color + '" ' + st() + '/>';
    return '<path d="M4 72 q46 26 92 0z" fill="#4cc9f0" opacity=".55"/>' +
      '<path d="M14 58 q0 -20 30 -18 q26 0 30 16 q-2 18 -30 18 q-26 0 -30 -16z" fill="' + color + '" ' + st() + '/>' +
      '<path d="M26 54 q14 -12 30 0 q-14 8 -30 0z" fill="' + (color === '#fff' ? '#e9ecef' : '#e9c46a') + '" ' + st(2) + '/>' + neck +
      (neckLong ? '<path d="M84 22 l10 5 l-10 4z" fill="' + beak + '" ' + st(2) + '/><circle cx="78" cy="22" r="2" fill="' + D + '"/>'
        : '<path d="M84 38 l12 2 l-12 6z" fill="' + beak + '" ' + st(2) + '/><circle cx="76" cy="35" r="2.5" fill="' + D + '"/>');
  }
  function flyer(kind) {
    var wing = kind === 'bee' ? '#dff3ff' : '#ff8fab', wing2 = kind === 'bee' ? '#dff3ff' : '#ffc2d4';
    var body = kind === 'bee' ? '<ellipse cx="50" cy="56" rx="12" ry="20" fill="#ffd23f" ' + st() + '/>' + line('M39 50 h22 M39 60 h22', D, 5) :
      '<ellipse cx="50" cy="56" rx="6" ry="24" fill="#6a4c93" ' + st() + '/>';
    return '<path d="M48 50 q-30 -34 -40 -8 q-4 18 40 14z" fill="' + wing + '" ' + st() + '/>' +
      '<path d="M52 50 q30 -34 40 -8 q4 18 -40 14z" fill="' + wing + '" ' + st() + '/>' +
      '<path d="M48 60 q-24 4 -26 18 q14 8 26 -10z" fill="' + wing2 + '" ' + st(2) + '/>' +
      '<path d="M52 60 q24 4 26 18 q-14 8 -26 -10z" fill="' + wing2 + '" ' + st(2) + '/>' + body +
      line('M46 34 q-6 -14 -12 -16 M54 34 q6 -14 12 -16', D, 2.5) + '<circle cx="50" cy="34" r="6" fill="' + D + '"/>';
  }
  function sportBall(kind) {
    if (kind === 'soccer') {
      return '<circle cx="50" cy="50" r="38" fill="#fff" ' + st() + '/>' +
        '<path d="' + star(50, 50, 13, 13, 5) + '" fill="' + D + '"/>' +
        line('M50 37 V14 M62 46 L84 38 M58 61 L72 80 M42 61 L28 80 M38 46 L16 38', D, 3) +
        dots([[50, 14], [84, 38], [72, 82], [28, 82], [16, 38]], 6, D);
    }
    return '<circle cx="50" cy="50" r="38" fill="#f77f00" ' + st() + '/>' +
      line('M12 50 h76 M50 12 v76 M24 22 q18 28 0 56 M76 22 q-18 28 0 56', D, 3);
  }
  function wheelVehicle(kind) {
    var w = '<circle cx="22" cy="72" r="14" fill="none" ' + st(4) + '/><circle cx="78" cy="72" r="14" fill="none" ' + st(4) + '/>';
    if (kind === 'scooter') {
      return '<circle cx="22" cy="78" r="9" fill="' + D + '"/><circle cx="78" cy="78" r="9" fill="' + D + '"/>' +
        '<rect x="20" y="66" width="56" height="8" rx="4" fill="#2ec4b6" ' + st() + '/>' + tube('M74 70 L66 14', '#2ec4b6', 4) +
        line('M56 14 h20', D, 6);
    }
    return w + line('M22 72 L38 46 L64 46 L78 72 M38 46 L50 72 L64 46 M50 72 L22 72', '#2ec4b6', 4) +
      line('M38 46 l-4 -8 h-8 M64 46 l-2 -12 h10', D, 4);
  }
  function flower(kind) {
    var head = kind === 'tulip' ? '<path d="M34 20 l8 10 l8 -14 l8 14 l8 -10 v14 q0 18 -16 18 q-16 0 -16 -18z" fill="#ff4d6d" ' + st() + '/>' :
      '<circle cx="50" cy="32" r="18" fill="#ff4d6d" ' + st() + '/><path d="M50 32 m-9 0 a9 9 0 1 0 9 -9 a5 5 0 1 1 -4 5" fill="none" stroke="#a4161a" stroke-width="3"/>';
    return line('M50 46 V94', '#2d9d4f', 5) + '<path d="M50 74 q-18 -10 -24 4 q14 6 24 -4z" fill="#52b788" ' + st(2) + '/>' +
      '<path d="M50 64 q18 -10 24 4 q-14 6 -24 -4z" fill="#52b788" ' + st(2) + '/>' + head;
  }
  function container(kind) {
    if (kind === 'mailbox') {
      return line('M50 60 V94', '#6c757d', 6) + '<path d="M18 30 q0 -16 16 -16 h32 q16 0 16 16 v32 h-64z" fill="#1982c4" ' + st() + '/>' +
        '<rect x="30" y="34" width="40" height="6" rx="3" fill="' + D + '"/>' + '<path d="M74 22 v-14 h14 v8 h-14" fill="#e63946" ' + st(2) + '/>';
    }
    return '<path d="M24 26 h52 l-6 66 h-40z" fill="#2d9d4f" ' + st() + '/>' + '<rect x="20" y="18" width="60" height="10" rx="4" fill="#1b7a3e" ' + st() + '/>' +
      line('M38 38 l2 44 M50 38 v44 M62 38 l-2 44', '#1b7a3e', 4);
  }
  function planet(rings) {
    var c = rings ? '#e9c46a' : '#f4a261';
    var out = rings ? '<ellipse cx="50" cy="52" rx="46" ry="12" fill="none" stroke="' + D + '" stroke-width="9" transform="rotate(-18 50 52)"/>' +
      '<ellipse cx="50" cy="52" rx="46" ry="12" fill="none" stroke="#d4a373" stroke-width="5" transform="rotate(-18 50 52)"/>' : '';
    return out + '<circle cx="50" cy="50" r="28" fill="' + c + '" ' + st() + '/>' +
      line('M24 42 q26 6 52 0 M22 54 q28 6 56 0', rings ? '#d4a373' : '#e76f51', 4) +
      (rings ? '<path d="M8 62 q42 -8 84 -26" fill="none" stroke="' + D + '" stroke-width="9" transform="rotate(0)" opacity="0"/>' : '<ellipse cx="60" cy="60" rx="7" ry="4" fill="#c1440e"/>');
  }
  function roundSpotty(base, spots, spotColor) {
    return '<circle cx="50" cy="50" r="36" fill="' + base + '" ' + st() + '/>' + dots(spots, 5, spotColor);
  }
  function spaceGuy(kind) {
    if (kind === 'astronaut') {
      return '<rect x="30" y="50" width="40" height="36" rx="10" fill="#f1f3f5" ' + st() + '/>' +
        '<rect x="40" y="58" width="20" height="12" rx="2" fill="#ff595e" ' + st(2) + '/>' +
        '<circle cx="50" cy="32" r="22" fill="#f1f3f5" ' + st() + '/><rect x="34" y="22" width="32" height="20" rx="9" fill="#4cc9f0" ' + st(2) + '/>' + shine('M40 28 q4 -3 8 -2');
    }
    return '<rect x="30" y="50" width="40" height="36" rx="4" fill="#adb5bd" ' + st() + '/>' +
      '<circle cx="42" cy="64" r="3" fill="#ff595e"/><circle cx="58" cy="64" r="3" fill="#8ac926"/>' +
      '<rect x="30" y="14" width="40" height="34" rx="6" fill="#ced4da" ' + st() + '/>' + line('M50 14 V4', D, 3) + '<circle cx="50" cy="4" r="3" fill="#ff595e"/>' +
      '<rect x="36" y="22" width="28" height="12" rx="6" fill="#4cc9f0" ' + st(2) + '/>';
  }
  function dishLike(kind) {
    if (kind === 'satellite') {
      return '<rect x="6" y="38" width="26" height="24" fill="#1982c4" ' + st() + '/><rect x="68" y="38" width="26" height="24" fill="#1982c4" ' + st() + '/>' +
        line('M6 50 h26 M68 50 h26 M19 38 v24 M81 38 v24', '#4cc9f0', 2) + line('M32 50 h36', D, 4) +
        '<rect x="38" y="34" width="24" height="32" rx="4" fill="#ced4da" ' + st() + '/>' + '<path d="M44 34 q6 -14 12 0" fill="#ffd166" ' + st(2) + '/>';
    }
    return line('M50 62 V92 M36 92 h28', D, 6) + '<path d="M14 40 q36 52 72 0z" fill="#ced4da" ' + st() + '/>' +
      line('M50 50 L66 24', D, 4) + '<circle cx="66" cy="24" r="5" fill="#ff595e" ' + st(2) + '/>';
  }
  function lumpy(color, spots, spotColor) {
    return '<path d="M20 50 q-4 -26 24 -30 q30 -6 38 18 q8 26 -16 36 q-34 14 -46 -24z" fill="' + color + '" ' + st() + '/>' + dots(spots, 4, spotColor);
  }
  function greenFace(kind) {
    if (kind === 'alien') {
      return '<path d="M30 46 l-14 -24 M70 46 l14 -24" fill="none" stroke="' + D + '" stroke-width="3"/><circle cx="16" cy="22" r="5" fill="#8ac926" ' + st(2) + '/><circle cx="84" cy="22" r="5" fill="#8ac926" ' + st(2) + '/>' +
        '<path d="M50 20 q32 0 32 34 q0 30 -32 34 q-32 -4 -32 -34 q0 -34 32 -34z" fill="#8ac926" ' + st() + '/>' +
        '<ellipse cx="38" cy="52" rx="9" ry="12" fill="' + D + '"/><ellipse cx="62" cy="52" rx="9" ry="12" fill="' + D + '"/>' + line('M42 74 q8 5 16 0', D, 3);
    }
    return '<circle cx="34" cy="30" r="11" fill="#57cc99" ' + st() + '/><circle cx="66" cy="30" r="11" fill="#57cc99" ' + st() + '/>' +
      '<path d="M12 70 q0 -36 38 -36 q38 0 38 36 q-38 16 -76 0z" fill="#57cc99" ' + st() + '/>' +
      '<circle cx="34" cy="30" r="5" fill="' + D + '"/><circle cx="66" cy="30" r="5" fill="' + D + '"/>' + line('M30 58 q20 12 40 0', D, 3);
  }
  function tubeScope(kind) {
    if (kind === 'telescope') {
      return line('M44 64 L28 94 M50 64 V94 M56 64 L72 94', D, 4) +
        '<g transform="rotate(-30 50 50)"><rect x="14" y="40" width="72" height="18" rx="4" fill="#1982c4" ' + st() + '/>' +
        '<rect x="80" y="36" width="10" height="26" rx="3" fill="#ffd166" ' + st(2) + '/><rect x="8" y="44" width="8" height="10" fill="' + D + '"/></g>';
    }
    return '<rect x="20" y="84" width="60" height="8" rx="3" fill="' + D + '"/>' + tube('M64 84 q12 -30 -6 -54', '#adb5bd', 6) +
      '<g transform="rotate(-25 46 40)"><rect x="38" y="12" width="16" height="44" rx="4" fill="#1982c4" ' + st() + '/></g>' +
      '<rect x="30" y="60" width="34" height="6" rx="2" fill="#adb5bd" ' + st(2) + '/>';
  }

  var ITEMS = {
    /* ========================== ОФИС ========================== */
    o_laptop: function () { return screen('<path d="M4 72 h92 l-8 12 h-76z" fill="#ced4da" ' + st() + '/>'); },
    o_monitor: function () { return screen(line('M50 66 V80', D, 6) + '<rect x="30" y="80" width="40" height="8" rx="3" fill="#ced4da" ' + st() + '/>'); },
    o_pen: function () { return writer('#1982c4', '<path d="M44 76 l6 14 l6 -14z" fill="#ced4da" ' + st(2) + '/>', '<rect x="42" y="10" width="16" height="14" rx="3" fill="#0b4f7c" ' + st(2) + '/>' + line('M58 14 v20', '#ced4da', 3)); },
    o_pencil: function () { return writer('#ffbe0b', '<path d="M44 76 l6 14 l6 -14z" fill="#f2cc8f" ' + st(2) + '/><path d="M48 85 l2 5 l2 -5z" fill="' + D + '"/>', '<rect x="44" y="8" width="12" height="10" rx="2" fill="#ff8fab" ' + st(2) + '/>'); },
    o_stapler: function () {
      return '<rect x="10" y="70" width="80" height="12" rx="4" fill="#495057" ' + st() + '/>' +
        '<path d="M14 66 q0 -22 26 -22 h44 q6 0 6 8 v14z" fill="#e63946" ' + st() + '/>' + shine('M28 52 h40');
    },
    o_tape: function () {
      return '<path d="M8 82 v-26 q0 -16 22 -16 h40 q22 0 22 16 v26z" fill="#495057" ' + st() + '/>' +
        '<circle cx="44" cy="52" r="18" fill="#f4f1ea" ' + st() + '/><circle cx="44" cy="52" r="8" fill="#adb5bd" ' + st(2) + '/>' +
        '<path d="M62 46 l26 -6 l2 6z" fill="#dee2e6" ' + st(2) + '/>';
    },
    o_sticky: function () {
      return '<g transform="rotate(-6 50 50)"><path d="M16 16 h68 v52 l-16 16 h-52z" fill="#ffe14d" ' + st() + '/><path d="M84 68 h-16 v16z" fill="#e0b100" ' + st(2) + '/>' +
        line('M26 32 h44 M26 44 h36 M26 56 h40', '#b08900', 3) + '</g>';
    },
    o_envelope: function () {
      return '<g transform="rotate(-6 50 50)"><rect x="12" y="24" width="76" height="54" rx="3" fill="#ffe8a3" ' + st() + '/>' +
        line('M12 26 L50 56 L88 26 M12 78 L40 52 M88 78 L60 52', D, 3) + '<rect x="70" y="30" width="12" height="14" fill="#ff595e"/></g>';
    },
    o_calc: function () {
      var k = '';
      for (var r = 0; r < 4; r++) for (var c = 0; c < 3; c++) k += '<rect x="' + (30 + c * 14) + '" y="' + (42 + r * 12) + '" width="10" height="8" rx="2" fill="' + (c === 2 ? '#f77f00' : '#dee2e6') + '"/>';
      return '<rect x="24" y="10" width="52" height="82" rx="8" fill="#495057" ' + st() + '/><rect x="30" y="18" width="40" height="16" rx="2" fill="#b7e4c7" ' + st(2) + '/>' +
        '<text x="66" y="31" font-family="Arial" font-weight="900" font-size="11" text-anchor="end" fill="#1b4332">42</text>' + k;
    },
    o_deskphone: function () {
      var k = '';
      for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) k += '<rect x="' + (52 + c * 10) + '" y="' + (56 + r * 9) + '" width="7" height="6" rx="1.5" fill="#dee2e6"/>';
      return '<path d="M14 92 l6 -40 h60 l6 40z" fill="#495057" ' + st() + '/>' +
        '<path d="M10 40 q0 -18 16 -18 h48 q16 0 16 18 l-12 6 q-4 -10 -10 -10 h-36 q-6 0 -10 10z" fill="#343a40" ' + st() + '/>' +
        '<rect x="22" y="58" width="22" height="22" rx="3" fill="#b7e4c7" ' + st(2) + '/>' + k;
    },
    o_cactus: function () {
      return potPlant('<path d="M44 60 V24 q0 -10 6 -10 q6 0 6 10 V60z" fill="#52b788" ' + st() + '/>' +
        '<path d="M44 44 h-10 q-6 0 -6 -6 v-8 q0 -4 4 -4 q4 0 4 4 v6 h8z" fill="#52b788" ' + st(2) + '/>' +
        '<path d="M56 38 h10 q6 0 6 -6 v-6 q0 -4 -4 -4 q-4 0 -4 4 v4 h-8z" fill="#52b788" ' + st(2) + '/>' + dots([[48, 30], [53, 40], [48, 50]], 1.5, D));
    },
    o_bonsai: function () {
      return potPlant(tube('M50 60 q-4 -14 6 -24 q-10 -6 -14 -14', '#8d5a3b', 4) +
        '<ellipse cx="34" cy="22" rx="18" ry="10" fill="#40916c" ' + st() + '/><ellipse cx="66" cy="32" rx="18" ry="10" fill="#52b788" ' + st() + '/>');
    },
    o_mug: function () {
      return tube('M74 46 q16 0 16 12 q0 14 -18 14', '#f1f3f5', 4) + cupBox('#f1f3f5', '') +
        '<ellipse cx="50" cy="40" rx="24" ry="5" fill="#6b3e26" ' + st(2) + '/>' +
        '<text x="50" y="70" font-family="Arial Black,Arial" font-weight="900" font-size="15" text-anchor="middle" fill="#e63946">♥</text>';
    },
    o_pencup: function () {
      return cupBox('#9d4edd', line('M36 44 L30 12 M50 44 V8 M62 44 L72 14', D, 5) + line('M36 44 L30 12', '#ffbe0b', 3) + line('M50 44 V8', '#1982c4', 3) + line('M62 44 L72 14', '#e63946', 3));
    },
    o_folder: function () {
      return '<path d="M8 28 q0 -6 6 -6 h22 l8 8 h42 q6 0 6 6 v46 q0 6 -6 6 h-72 q-6 0 -6 -6z" fill="#f4a261" ' + st() + '/>' +
        '<rect x="20" y="30" width="60" height="10" fill="#fff" ' + st(2) + '/><path d="M8 42 h84 v40 q0 6 -6 6 h-72 q-6 0 -6 -6z" fill="#e9c46a" ' + st() + '/>';
    },
    o_clipboard: function () { return sheetBoard('<rect x="38" y="6" width="24" height="12" rx="3" fill="#adb5bd" ' + st() + '/>', '#bc6c25'); },
    o_printer: function () {
      return '<rect x="26" y="8" width="48" height="30" fill="#fff" ' + st() + '/>' +
        '<rect x="10" y="32" width="80" height="38" rx="6" fill="#adb5bd" ' + st() + '/><circle cx="78" cy="44" r="4" fill="#8ac926"/>' +
        '<rect x="24" y="62" width="52" height="30" fill="#fff" ' + st() + '/>' + line('M32 72 h36 M32 80 h28', '#adb5bd', 3);
    },
    o_scissors: function () {
      return '<g transform="rotate(-35 50 50)">' + '<path d="M46 50 L40 6 l10 2z" fill="#ced4da" ' + st() + '/><path d="M54 50 L60 6 l-10 2z" fill="#ced4da" ' + st() + '/>' +
        '<circle cx="36" cy="72" r="13" fill="none" stroke="#e63946" stroke-width="7"/><circle cx="64" cy="72" r="13" fill="none" stroke="#e63946" stroke-width="7"/>' +
        line('M44 60 L48 50 M56 60 L52 50', '#e63946', 6) + '<circle cx="50" cy="50" r="3" fill="' + D + '"/></g>';
    },
    o_ruler: function () {
      var ticks = '';
      for (var i = 0; i <= 12; i++) ticks += 'M' + (14 + i * 6) + ' 40 v' + (i % 2 ? 6 : 11) + ' ';
      return '<g transform="rotate(-20 50 50)"><rect x="8" y="38" width="84" height="24" rx="3" fill="#ffd166" ' + st() + '/>' + line(ticks, D, 2) + '</g>';
    },
    o_lamp: function () {
      return '<rect x="22" y="84" width="40" height="8" rx="3" fill="#343a40" ' + st() + '/>' + tube('M42 84 L30 50 L58 26', '#495057', 4) +
        '<path d="M52 14 l30 12 l-12 26 q-22 -4 -28 -22z" fill="#2ec4b6" ' + st() + '/>' + '<path d="M70 52 l12 16" stroke="#ffd166" stroke-width="5" stroke-dasharray="4 4"/>';
    },
    o_headset: function () {
      return '<path d="M18 56 q0 -40 32 -40 q32 0 32 40" fill="none" stroke="' + D + '" stroke-width="8"/>' +
        '<rect x="10" y="50" width="18" height="28" rx="8" fill="#6a4c93" ' + st() + '/><rect x="72" y="50" width="18" height="28" rx="8" fill="#6a4c93" ' + st() + '/>' +
        tube('M20 78 q4 14 24 12', '#495057', 3) + '<circle cx="46" cy="90" r="5" fill="' + D + '"/>';
    },
    o_calendar: function () {
      return '<rect x="14" y="18" width="72" height="72" rx="6" fill="#fff" ' + st() + '/><rect x="14" y="18" width="72" height="20" rx="6" fill="#e63946" ' + st() + '/>' +
        line('M32 12 v14 M68 12 v14', D, 6) + '<text x="50" y="76" font-family="Arial Black,Arial" font-weight="900" font-size="32" text-anchor="middle" fill="' + D + '">14</text>';
    },
    o_globe: function () {
      return line('M50 80 V92 M34 92 h32', D, 6) + '<path d="M20 50 a30 30 0 0 0 52 20" fill="none" stroke="#adb5bd" stroke-width="5"/>' +
        '<circle cx="50" cy="46" r="28" fill="#4cc9f0" ' + st() + '/>' +
        '<path d="M34 30 q10 -6 16 2 q-2 10 -12 10 q-8 6 -4 14 q-10 -8 0 -26z M58 50 q10 -4 14 6 q-4 10 -14 8z" fill="#52b788" ' + st(2) + '/>';
    },
    o_paperclip: function () {
      return '<g transform="rotate(30 50 50)"><path d="M40 70 V26 q0 -14 12 -14 q12 0 12 14 v46 q0 20 -18 20 q-18 0 -18 -20 V30" fill="none" stroke="' + D + '" stroke-width="9" stroke-linecap="round"/>' +
        '<path d="M40 70 V26 q0 -14 12 -14 q12 0 12 14 v46 q0 20 -18 20 q-18 0 -18 -20 V30" fill="none" stroke="#adb5bd" stroke-width="4" stroke-linecap="round"/></g>';
    },

    /* ========================== ПАРК ========================== */
    p_tree: function () {
      return '<rect x="43" y="56" width="14" height="36" fill="#8d5a3b" ' + st() + '/>' +
        '<circle cx="50" cy="38" r="28" fill="#52b788" ' + st() + '/><circle cx="32" cy="50" r="16" fill="#40916c" ' + st() + '/><circle cx="68" cy="50" r="16" fill="#40916c" ' + st() + '/>' +
        dots([[42, 30], [60, 40], [50, 52]], 4, '#e63946');
    },
    p_pine: function () {
      return '<rect x="44" y="76" width="12" height="16" fill="#8d5a3b" ' + st() + '/>' +
        '<path d="M50 6 L74 40 h-12 L82 62 h-14 L90 80 h-80 L32 62 h-14 L38 40 h-12z" fill="#2d6a4f" ' + st() + '/>';
    },
    p_duck: function () { return bird(false, '#ffd23f', '#f77f00'); },
    p_swan: function () { return bird(true, '#fff', '#f77f00'); },
    p_kite: function () {
      return '<path d="M50 6 L80 36 L50 74 L20 36z" fill="#e63946" ' + st() + '/><path d="M50 6 L50 74 M20 36 L80 36" stroke="' + D + '" stroke-width="2.5"/>' +
        '<path d="M50 6 L80 36 L50 36z" fill="#ffd166"/>' + line('M50 74 q-8 8 0 12 q8 4 0 10', D, 2.5) +
        '<path d="M44 82 l6 3 l-6 3z M54 90 l-6 3 l6 3z" fill="#1982c4"/>';
    },
    p_balloon: function () {
      return '<path d="M50 6 q26 0 26 30 q0 26 -26 36 q-26 -10 -26 -36 q0 -30 26 -30z" fill="#e63946" ' + st() + '/>' +
        '<path d="M46 72 h8 l-4 6z" fill="#e63946" ' + st(2) + '/>' + line('M50 78 q-8 8 0 12 q8 4 0 8', D, 2.5) + shine('M36 26 q4 -10 12 -12');
    },
    p_butterfly: function () { return flyer('butterfly'); },
    p_bee: function () { return flyer('bee'); },
    p_soccer: function () { return sportBall('soccer'); },
    p_basketball: function () { return sportBall('basket'); },
    p_scooter: function () { return wheelVehicle('scooter'); },
    p_bike: function () { return wheelVehicle('bike'); },
    p_mailbox: function () { return container('mailbox'); },
    p_bin: function () { return container('bin'); },
    p_tulip: function () { return flower('tulip'); },
    p_rose: function () { return flower('rose'); },
    p_fountain: function () {
      return '<path d="M8 72 h84 l-8 18 h-68z" fill="#adb5bd" ' + st() + '/><ellipse cx="50" cy="72" rx="42" ry="8" fill="#4cc9f0" ' + st() + '/>' +
        '<rect x="44" y="40" width="12" height="30" fill="#ced4da" ' + st() + '/>' +
        '<path d="M50 38 q-22 -28 -34 22 M50 38 q22 -28 34 22 M50 38 V8" fill="none" stroke="#4cc9f0" stroke-width="5" stroke-linecap="round"/>';
    },
    p_basket: function () {
      return tube('M24 46 q26 -44 52 0', '#bc6c25', 4) + '<path d="M14 46 h72 l-8 42 h-56z" fill="#dda15e" ' + st() + '/>' +
        line('M18 58 h64 M20 70 h60 M24 82 h52 M34 46 l2 42 M50 46 v42 M66 46 l-2 42', '#bc6c25', 2.5) +
        '<path d="M14 46 h72 v8 h-72z" fill="#e63946" ' + st(2) + '/>';
    },
    p_hotdog: function () {
      return '<g transform="rotate(-15 50 50)"><path d="M10 54 q0 -14 14 -14 h52 q14 0 14 14 q0 14 -14 14 h-52 q-14 0 -14 -14z" fill="#e9c46a" ' + st() + '/>' +
        '<rect x="4" y="44" width="92" height="14" rx="7" fill="#c1440e" ' + st() + '/>' + line('M18 50 q6 -6 12 0 q6 6 12 0 q6 -6 12 0 q6 6 12 0 q6 -6 12 0', '#ffd60a', 3) + '</g>';
    },
    p_cloud: function () {
      return '<path d="M22 70 q-16 0 -16 -14 q0 -14 16 -14 q2 -18 22 -18 q16 0 22 14 q4 -4 10 -4 q16 0 16 16 q12 2 12 12 q0 10 -12 10z" fill="#fff" ' + st() + '/>' +
        '<path d="M30 82 l-4 10 M50 82 l-4 10 M70 82 l-4 10" stroke="#4cc9f0" stroke-width="4" stroke-linecap="round"/>';
    },
    p_bench: function () {
      return line('M18 60 v30 M82 60 v30', D, 6) + '<rect x="6" y="26" width="88" height="10" rx="3" fill="#2d9d4f" ' + st() + '/>' +
        '<rect x="6" y="40" width="88" height="10" rx="3" fill="#2d9d4f" ' + st() + '/><rect x="2" y="56" width="96" height="10" rx="3" fill="#52b788" ' + st() + '/>';
    },
    p_skateboard: function () {
      return '<g transform="rotate(-12 50 50)"><path d="M6 46 q0 -8 10 -8 h68 q10 0 10 8 q0 8 -10 8 h-68 q-10 0 -10 -8z" fill="#9b5de5" ' + st() + '/>' +
        line('M24 46 h52', '#f15bb5', 4) + '<circle cx="24" cy="64" r="7" fill="#ffd166" ' + st(2) + '/><circle cx="76" cy="64" r="7" fill="#ffd166" ' + st(2) + '/>' + line('M24 54 v4 M76 54 v4', D, 4) + '</g>';
    },
    p_mushroom: function () {
      return '<path d="M38 52 h24 l4 38 h-32z" fill="#fff8e7" ' + st() + '/><path d="M8 54 q0 -42 42 -42 q42 0 42 42z" fill="#e63946" ' + st() + '/>' +
        dots([[30, 34], [52, 24], [70, 40], [46, 44]], 6, '#fff');
    },
    p_squirrel: function () {
      return '<path d="M30 84 q-26 -10 -18 -42 q8 -28 30 -16 q-14 8 -8 26 q6 16 -4 32z" fill="#bc6c25" ' + st() + '/>' +
        '<ellipse cx="56" cy="68" rx="18" ry="20" fill="#dda15e" ' + st() + '/><circle cx="62" cy="38" r="14" fill="#dda15e" ' + st() + '/>' +
        '<path d="M56 26 l2 -10 l6 8z M66 26 l4 -10 l4 10z" fill="#dda15e" ' + st(2) + '/><circle cx="66" cy="36" r="2.5" fill="' + D + '"/>' +
        '<ellipse cx="60" cy="66" rx="8" ry="6" fill="#8d5a3b" ' + st(2) + '/>';
    },

    /* ========================== КОСМОС ========================== */
    x_saturn: function () { return planet(true); },
    x_jupiter: function () { return planet(false); },
    x_moon: function () { return roundSpotty('#dee2e6', [[36, 38], [60, 30], [58, 62], [38, 64], [70, 48]], '#adb5bd'); },
    x_cookie: function () { return roundSpotty('#d4934a', [[36, 38], [60, 30], [58, 62], [38, 64], [70, 48]], '#5e3a1f'); },
    x_astronaut: function () { return spaceGuy('astronaut'); },
    x_robot: function () { return spaceGuy('robot'); },
    x_satellite: function () { return dishLike('satellite'); },
    x_dish: function () { return dishLike('dish'); },
    x_meteor: function () {
      return line('M70 30 L94 6 M76 40 L96 22 M62 24 L80 4', '#ffbe0b', 5) + lumpy('#6c757d', [[38, 40], [56, 54], [40, 62]], '#495057');
    },
    x_potato: function () { return lumpy('#c8913f', [[38, 40], [56, 54], [40, 62]], '#8d5a3b'); },
    x_alien: function () { return greenFace('alien'); },
    x_frog: function () { return greenFace('frog'); },
    x_telescope: function () { return tubeScope('telescope'); },
    x_microscope: function () { return tubeScope('microscope'); },
    x_rocket: function () {
      return '<g transform="rotate(35 50 50)"><path d="M50 4 q18 16 18 46 v26 h-36 v-26 q0 -30 18 -46z" fill="#f1f3f5" ' + st() + '/>' +
        '<circle cx="50" cy="40" r="8" fill="#4cc9f0" ' + st(2) + '/><path d="M32 60 l-12 20 h12z M68 60 l12 20 h-12z" fill="#e63946" ' + st() + '/>' +
        '<path d="M40 76 l10 20 l10 -20z" fill="#ff9f1c" ' + st(2) + '/></g>';
    },
    x_pencil: function () {
      return '<g transform="rotate(35 50 50)"><path d="M50 4 l10 18 v58 h-20 v-58z" fill="#ffbe0b" ' + st() + '/><path d="M40 22 h20 L50 4z" fill="#f2cc8f" ' + st(2) + '/>' +
        '<path d="M46 12 l4 -8 l4 8z" fill="' + D + '"/><rect x="40" y="80" width="20" height="12" rx="3" fill="#ff8fab" ' + st(2) + '/></g>';
    },
    x_earth: function () {
      return '<circle cx="50" cy="50" r="38" fill="#1982c4" ' + st() + '/>' +
        '<path d="M26 30 q12 -10 22 0 q-2 14 -16 14 q-10 8 -4 20 q-14 -12 -2 -34z M56 56 q14 -6 20 8 q-6 14 -20 10z M60 20 q10 2 12 10 q-8 2 -12 -10z" fill="#52b788" ' + st(2) + '/>';
    },
    x_star: function () { return '<path d="' + star(50, 52, 42, 18, 5) + '" fill="#ffd23f" ' + st() + '/>' + '<circle cx="42" cy="48" r="3" fill="' + D + '"/><circle cx="58" cy="48" r="3" fill="' + D + '"/>' + line('M44 60 q6 5 12 0', D, 2.5); },
    x_comet: function () {
      return '<path d="M60 34 Q30 30 4 8 Q26 44 56 60z" fill="#90e0ef" opacity=".8"/>' + '<path d="M60 40 Q36 44 12 30 Q32 58 56 60z" fill="#4cc9f0" opacity=".8"/>' +
        '<circle cx="66" cy="54" r="18" fill="#f1f3f5" ' + st() + '/>' + dots([[60, 50], [70, 60]], 3, '#adb5bd');
    },
    x_ufo: function () {
      return '<path d="M30 46 q0 -26 20 -26 q20 0 20 26z" fill="#90e0ef" ' + st() + '/>' +
        '<ellipse cx="50" cy="54" rx="44" ry="14" fill="#adb5bd" ' + st() + '/>' + dots([[22, 54], [40, 58], [60, 58], [78, 54]], 4, '#ffd166') +
        '<path d="M38 68 l-10 24 h44 l-10 -24z" fill="#ffd166" opacity=".45"/>';
    },
    x_flag: function () {
      return '<ellipse cx="40" cy="90" rx="30" ry="6" fill="#adb5bd" ' + st(2) + '/>' + line('M30 90 V10', D, 5) +
        '<path d="M32 12 h52 v32 h-52z" fill="#e63946" ' + st() + '/><path d="' + star(58, 28, 9, 4, 5) + '" fill="#ffd166"/>';
    },
    x_rover: function () {
      return '<circle cx="22" cy="78" r="10" fill="#495057" ' + st() + '/><circle cx="50" cy="78" r="10" fill="#495057" ' + st() + '/><circle cx="78" cy="78" r="10" fill="#495057" ' + st() + '/>' +
        '<rect x="12" y="50" width="76" height="20" rx="4" fill="#f4a261" ' + st() + '/>' + line('M64 50 V24', D, 4) +
        '<rect x="56" y="14" width="22" height="12" rx="3" fill="#ced4da" ' + st() + '/><circle cx="72" cy="20" r="3" fill="#4cc9f0"/>' +
        '<rect x="18" y="40" width="34" height="10" fill="#1982c4" ' + st(2) + '/>';
    },
    x_blackhole: function () {
      return '<ellipse cx="50" cy="50" rx="44" ry="18" fill="#ff9f1c" opacity=".85" ' + st(2) + '/><ellipse cx="50" cy="50" rx="32" ry="12" fill="#ffd166"/>' +
        '<circle cx="50" cy="50" r="18" fill="#000" ' + st() + '/><path d="M8 50 q42 -12 84 0" fill="none" stroke="#ff9f1c" stroke-width="4"/>';
    },
    x_helmet: function () {
      return '<path d="M16 80 v-30 q0 -34 34 -34 q34 0 34 34 v30z" fill="#f1f3f5" ' + st() + '/>' +
        '<rect x="26" y="36" width="48" height="30" rx="14" fill="#ffb703" ' + st() + '/>' + shine('M34 44 q6 -5 14 -4') +
        '<rect x="12" y="78" width="76" height="12" rx="4" fill="#adb5bd" ' + st() + '/>';
    }
  };

  /* ---------------- фоны сцен (1600×900) ---------------- */
  var BACKGROUNDS = {
    office: function () {
      var win = '';
      for (var i = 0; i < 3; i++) {
        var x = 120 + i * 500;
        win += '<rect x="' + x + '" y="40" width="360" height="160" rx="10" fill="#bde0fe" stroke="#7d8597" stroke-width="6"/>' +
          '<path d="M' + (x + 180) + ' 40 V200" stroke="#7d8597" stroke-width="4"/>';
      }
      return '<rect width="1600" height="900" fill="#e9ecef"/>' + win +
        '<rect y="222" width="1600" height="14" fill="#adb5bd"/><rect y="426" width="1600" height="14" fill="#adb5bd"/>' +
        '<rect y="622" width="1600" height="30" fill="#8d6e53" stroke="#2d2a3e" stroke-width="3"/>' +
        '<rect y="652" width="1600" height="248" fill="#6c584c"/>' +
        [80, 560, 1040].map(function (x) { return '<rect x="' + x + '" y="672" width="440" height="200" rx="8" fill="#7f6a5c" stroke="#4a3b31" stroke-width="3"/>'; }).join('');
    },
    park: function () {
      return '<defs><linearGradient id="parkSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a2d2ff"/><stop offset="1" stop-color="#e0f2ff"/></linearGradient></defs>' +
        '<rect width="1600" height="260" fill="url(#parkSky)"/>' +
        '<path d="M0 260 q200 -80 400 -10 t400 -20 t400 10 t400 -20 V900 H0z" fill="#95d5b2"/>' +
        '<path d="M0 470 q300 -40 800 0 t800 0 V900 H0z" fill="#74c69d"/>' +
        '<path d="M520 900 q120 -260 280 -440 q160 180 280 440z" fill="#e9d8a6" opacity=".9"/>' +
        dots([[200, 560], [1400, 600], [300, 800], [1250, 820], [900, 720]], 6, '#52b788');
    },
    space: function () {
      var stars = '';
      var seed = 7;
      for (var i = 0; i < 120; i++) {
        seed = (seed * 9301 + 49297) % 233280;
        var x = seed / 233280 * 1600;
        seed = (seed * 9301 + 49297) % 233280;
        var y = seed / 233280 * 900;
        stars += '<circle cx="' + x.toFixed(0) + '" cy="' + y.toFixed(0) + '" r="' + (i % 5 ? 2 : 4) + '" fill="#fff" opacity="' + (i % 3 ? .5 : .9) + '"/>';
      }
      return '<defs><radialGradient id="neb" cx="70%" cy="30%" r="70%"><stop offset="0" stop-color="#5a189a"/><stop offset=".6" stop-color="#240046"/><stop offset="1" stop-color="#10002b"/></radialGradient></defs>' +
        '<rect width="1600" height="900" fill="url(#neb)"/>' + stars +
        '<ellipse cx="300" cy="200" rx="260" ry="90" fill="#c77dff" opacity=".12"/><ellipse cx="1200" cy="700" rx="320" ry="110" fill="#4cc9f0" opacity=".1"/>' +
        '<path d="M0 820 q400 -60 800 -20 t800 0 V900 H0z" fill="#adb5bd"/>' + dots([[200, 860], [700, 850], [1300, 860]], 18, '#868e96');
    }
  };

  for (var k in ITEMS) ART.ITEMS[k] = ITEMS[k];
  for (var b in BACKGROUNDS) ART.BACKGROUNDS[b] = BACKGROUNDS[b];
  if (typeof module !== 'undefined' && module.exports) module.exports = ART;
})(this);

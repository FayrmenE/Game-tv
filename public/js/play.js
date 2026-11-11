/* Экран телефона — оболочка платформы: вход, меню хоста, пьедестал. Игры — window.GAMES[*].play */
(function () {
  'use strict';
  var t = U.t, esc = U.esc;
  var socket = io();
  var P = null;
  var active = null, screenKey = null, hostKey = null, hostPhase = null, lang = null;
  var kicked = false, joining = false;
  var $ = function (id) { return document.getElementById(id); };
  var MODULE = { alien: 'alien', sniper: 'sniper', croc_solo: 'croc', croc_duel: 'croc', telepathy: 'telepathy', battleship: 'battleship', doodle: 'doodle' };
  var EMOJI = { alien: '👽', sniper: '🎯', croc_solo: '🐊', croc_duel: '⚔️', telepathy: '🔮', battleship: '🚢', doodle: '🖍️' };

  var params = new URLSearchParams(location.search);
  var ls = {
    get: function (k) { try { return localStorage.getItem('party.' + k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem('party.' + k, v); } catch (e) { /* ignore */ } }
  };
  /*
   * Токен игрока — в localStorage: телефон возвращается на своё место после
   * перезагрузки или потери связи. ?fresh=1 — отдельный игрок в этой вкладке
   * (токен в sessionStorage), удобно для тестов на одном компьютере.
   */
  var token = (function () {
    var gen = function () { return Math.random().toString(36).slice(2) + Date.now().toString(36); };
    try {
      var s = sessionStorage.getItem('party.token');
      if (s) return s;
      if (params.get('fresh')) { s = gen(); sessionStorage.setItem('party.token', s); return s; }
      var l = localStorage.getItem('party.token');
      if (!l) { l = gen(); localStorage.setItem('party.token', l); }
      return l;
    } catch (e) { return gen(); }
  })();
  var roomCode = (params.get('room') || ls.get('room') || '').toUpperCase();

  function showErr(msg) {
    var e = $('err');
    e.textContent = msg;
    e.classList.toggle('hidden', !msg);
    if (msg) setTimeout(function () { if (e.textContent === msg) e.classList.add('hidden'); }, 4000);
  }
  var ctx = {
    act: function (type, data) { socket.emit('action', { type: type, data: data || {} }); },
    host: function (type, data) { socket.emit('host', { type: type, data: data || {} }); },
    showErr: showErr,
    socket: socket
  };
  window.PLAY = ctx;

  /* ------------------------------ сокет ------------------------------ */
  socket.on('connect', function () {
    $('conn').classList.add('hidden');
    if (ls.get('joined') === roomCode && roomCode && !kicked) doJoin(ls.get('name'));
  });
  socket.on('disconnect', function () { $('conn').textContent = t('play.disconnected'); $('conn').classList.remove('hidden'); });
  socket.on('joined', function (d) { joining = false; roomCode = d.room; ls.set('room', d.room); ls.set('joined', d.room); });
  socket.on('errorMsg', function (e) {
    joining = false;
    if (e.key === 'err.noRoom') { ls.set('joined', ''); P = null; renderJoin(); }
    showErr(t(e.key, e.vars));
  });
  socket.on('kicked', function () {
    kicked = true; P = null; ls.set('joined', '');
    unmountGame();
    $('host').classList.add('hidden'); $('top').classList.add('hidden');
    $('screen').innerHTML = '<div class="card big-msg"><div class="emoji">🚪</div><h2>' + esc(t('play.kicked')) + '</h2>' +
      '<button class="btn" id="rejoin">' + esc(t('play.rejoin')) + '</button></div>';
    $('rejoin').onclick = function () { kicked = false; renderJoin(); };
  });
  socket.on('state', function (s) { if (kicked) return; P = s; render(); });
  socket.on('timer', U.onTimer);
  socket.on('sfx', function (k) { SFX.play(k); });
  socket.on('avatars', function (m) { U.setAvatars(m); screenKey = null; hostKey = null; if (P) render(); });
  socket.on('ping2', function (t0, ack) { if (ack) ack(); });
  socket.onAny(function (ev, data) {
    var i = ev.indexOf(':');
    if (i < 0) return;
    var g = window.GAMES[ev.slice(0, i)];
    if (g && g.play && g.play.onEvent && active === ev.slice(0, i)) g.play.onEvent(ev.slice(i + 1), data, P);
  });
  U.loadScenes().then(function () { screenKey = null; if (P) { unmountGame(); render(); } });

  /* ------------------------------ не «выкидывать» с iPhone / iPad ------------------------------ */
  // Вернулись в браузер — сразу переподключаемся, не дожидаясь таймера socket.io
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    if (!socket.connected) socket.connect();
    keepAwake();
  });
  window.addEventListener('pageshow', function () { if (!socket.connected) socket.connect(); });
  window.addEventListener('online', function () { if (!socket.connected) socket.connect(); });
  // Не даём экрану гаснуть во время вечера (иначе iOS рвёт соединение)
  var wakeLock = null;
  function keepAwake() {
    try {
      if (!navigator.wakeLock || (wakeLock && !wakeLock.released) || document.visibilityState !== 'visible') return;
      navigator.wakeLock.request('screen').then(function (l) { wakeLock = l; }).catch(function () { /* нет разрешения — не страшно */ });
    } catch (e) { /* ignore */ }
  }
  ['pointerdown', 'touchend', 'click'].forEach(function (ev) { window.addEventListener(ev, keepAwake, { passive: true }); });

  function doJoin(name) {
    if (joining) return;
    joining = true;
    var av = ls.get('avatar');
    socket.emit('player:join', { room: roomCode, name: name, token: token, avatar: av || undefined });
    setTimeout(function () { joining = false; }, 3000);
  }

  /* ------------------------------ вход ------------------------------ */
  function renderJoin() {
    unmountGame();
    $('top').classList.add('hidden');
    $('host').classList.add('hidden');
    $('screen').innerHTML = '<div class="card"><h2>🎉 ' + esc(t('play.join')) + '</h2>' +
      '<label class="f" for="nm">' + esc(t('play.yourName')) + '</label>' +
      '<input class="t" id="nm" maxlength="16" autocomplete="nickname" value="' + esc(ls.get('name') || '') + '">' +
      '<label class="f" for="rc">' + esc(t('play.room')) + '</label>' +
      '<input class="t code" id="rc" maxlength="4" autocapitalize="characters" value="' + esc(roomCode) + '">' +
      avatarEditorHtml() +
      '<button class="btn" id="go">' + esc(t('play.enter')) + '</button></div>';
    var go = function () {
      var name = $('nm').value.trim();
      roomCode = $('rc').value.trim().toUpperCase();
      if (!name) return showErr(t('err.badName'));
      ls.set('name', name);
      saveAvatar();
      doJoin(name);
    };
    bindAvatarEditor();
    $('go').onclick = go;
    $('nm').onkeydown = $('rc').onkeydown = function (e) { if (e.key === 'Enter') go(); };
    if (!$('nm').value) $('nm').focus();
  }

  /* ------------------------------ аватар: нарисуй себя ------------------------------ */
  var avPad = null, avTool = 0, avDrawn = false;
  function avatarEditorHtml() {
    return '<label class="f">' + esc(t('avatar.draw')) + '</label><div class="av-edit"><div class="av-box"><canvas id="avCv"></canvas></div>' +
      '<div class="av-tools">' + CANVAS.COLORS.map(function (c, i) { return '<button class="cr-col' + (i === 0 ? ' sel' : '') + '" data-avc="' + i + '" style="background:' + c + '"></button>'; }).join('') +
      '<button class="cr-tool" id="avClr">🗑</button></div></div>';
  }
  function bindAvatarEditor() {
    if (avPad) avPad.destroy();
    avDrawn = false;
    avPad = new CANVAS.Pad($('avCv'), { send: function (ops) { if (ops.some(function (o) { return o.o === 's'; })) avDrawn = true; }, tool: function () { return { c: avTool, w: 1, e: false }; } });
    var old = ls.get('avatar');
    if (old) {
      var img = new Image();
      img.onload = function () { var c = avPad.board.ctx, sz = avPad.board.size; c.drawImage(img, 0, 0, sz, sz); avPad.board.strokes = []; avDrawn = 'old'; };
      img.src = old;
      avPad.board.redraw = (function (orig) { return function () { orig.call(this); if (avDrawn === 'old' && img.complete) this.ctx.drawImage(img, 0, 0, this.size, this.size); }; })(avPad.board.redraw);
    }
    document.querySelectorAll('[data-avc]').forEach(function (b) {
      b.onclick = function () { avTool = +b.dataset.avc; document.querySelectorAll('[data-avc]').forEach(function (x) { x.classList.toggle('sel', x === b); }); };
    });
    $('avClr').onclick = function () { avPad.clear(); avDrawn = false; ls.set('avatar', ''); };
  }
  /** Уменьшаем рисунок до 128×128 и сохраняем как PNG (data:URL) */
  function saveAvatar() {
    if (!avPad) return null;
    if (avDrawn === true) {
      var c = document.createElement('canvas');
      c.width = c.height = 128;
      c.getContext('2d').drawImage(avPad.board.canvas, 0, 0, 128, 128);
      ls.set('avatar', c.toDataURL('image/png'));
    }
    avPad.destroy(); avPad = null;
    return ls.get('avatar');
  }
  function openAvatarModal() {
    var m = $('modal');
    m.classList.remove('hidden');
    m.innerHTML = '<div class="card modal-card"><h2>🎨 ' + esc(t('avatar.change')) + '</h2>' + avatarEditorHtml() +
      '<div class="host-row"><button class="btn" id="avSave">' + esc(t('avatar.save')) + '</button><button class="btn sec" id="avCancel">' + esc(t('avatar.cancel')) + '</button></div></div>';
    bindAvatarEditor();
    $('avSave').onclick = function () { var a = saveAvatar(); socket.emit('avatar', { avatar: a || null }); m.classList.add('hidden'); m.innerHTML = ''; };
    $('avCancel').onclick = function () { if (avPad) { avPad.destroy(); avPad = null; } m.classList.add('hidden'); m.innerHTML = ''; };
  }

  /* ------------------------------ реакции ------------------------------ */
  var reactKey = null;
  function renderReactions() {
    var bar = $('reactBar');
    var show = P && P.me && P.phase !== 'menu';
    if (show && P.phase === 'game' && active && window.GAMES[active].play.hideReactions) show = !window.GAMES[active].play.hideReactions(P);
    bar.classList.toggle('hidden', !show);
    document.body.classList.toggle('has-react', !!show);
    if (!show) return;
    var k = P.reactions.join('');
    if (k === reactKey) return;
    reactKey = k;
    bar.innerHTML = P.reactions.map(function (e) { return '<button data-re="' + e + '">' + e + '</button>'; }).join('');
    bar.querySelectorAll('[data-re]').forEach(function (b) {
      b.onclick = function () { socket.emit('react', { e: b.dataset.re }); b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse'); };
    });
  }

  function msg(emoji, title, sub) {
    return '<div class="card big-msg"><div class="emoji">' + emoji + '</div><h2>' + esc(title) + '</h2>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>';
  }

  function unmountGame() {
    if (active && window.GAMES[active] && window.GAMES[active].play.unmount) window.GAMES[active].play.unmount();
    active = null;
    document.body.className = 'play';
    screenKey = null;
  }

  /* ------------------------------ основной рендер ------------------------------ */
  function render() {
    if (!P || !P.me) return;
    if (lang !== P.settings.lang) { lang = P.settings.lang; i18n.setLang(lang); screenKey = null; hostKey = null; }
    document.title = t('platform.title');
    renderTop();
    if (P.phase === 'game' && P.game && MODULE[P.gameId]) {
      var key = MODULE[P.gameId];
      if (active !== key) { unmountGame(); active = key; document.body.className = 'play game-' + key; }
      window.GAMES[key].play.render(P, $('screen'), ctx);
    } else {
      if (active) unmountGame();
      renderShellScreen();
    }
    renderHost();
    renderReactions();
  }

  function renderTop() {
    var me = P.me, top = $('top');
    top.classList.remove('hidden');
    var cup = P.cup.find(function (c) { return c.id === me.id; });
    var sub = esc(t('play.room')) + ': ' + esc(P.code) + (cup && cup.points ? ' · 🏆 ' + cup.points : '');
    if (P.phase === 'game' && P.game && P.game.roundNo) sub += ' · ' + esc(t('tv.round', { n: P.game.roundNo }));
    top.innerHTML = U.avatar(me) + '<div class="who">' + esc(me.name) + (me.isHost ? ' 👑' : '') + '<small>' + sub + '</small></div>' +
      '<div class="timer js-timer"></div>';
  }

  function renderShellScreen() {
    var key, html;
    if (P.phase === 'rules') {
      key = 'rules:' + P.rulesFor + lang;
      html = msg(EMOJI[P.rulesFor] || '📖', t('rules.phone'), t('game.' + P.rulesFor) + ' · ' + t('rules.phoneSub'));
    } else if (P.phase === 'podium') {
      var R = P.result, place = null;
      R.places.forEach(function (s) { if (s.ids.indexOf(P.me.id) >= 0) place = s.place; });
      var pts = R.cupDelta[P.me.id] || 0;
      key = 'podium:' + JSON.stringify(R.places) + lang;
      html = msg(place === 1 ? '🥇' : place === 2 ? '🥈' : place === 3 ? '🥉' : '👏',
        place ? t('podium.yourPlace', { n: place }) : t('play.lookTv'),
        t('podium.cupPoints', { n: pts })) +
        R.titles.filter(function (x) { return x.playerId === P.me.id; }).map(function (x) {
          return '<div class="card big-msg"><h2>🏅 ' + esc(t(x.key, x.vars)) + '</h2></div>';
        }).join('');
    } else if (P.phase === 'evening') {
      var champ = P.cup[0];
      key = 'evening:' + JSON.stringify(P.cup) + lang;
      html = msg('👑', champ ? t('evening.champion', { name: champ.name }) : t('evening.empty'), t('play.lookTv'));
    } else {
      key = 'menu:' + P.selected + ':' + P.me.isHost + lang + ':' + !!U.AVATARS[P.me.id];
      html = (P.me.isHost ? msg(EMOJI[P.selected] || '🎉', t('menu.youPick'), t('menu.youPickSub'))
        : msg(EMOJI[P.selected] || '🎉', t('menu.waitHost'), t('game.' + P.selected))) +
        '<button class="btn sec" id="avBtn">🎨 ' + esc(t('avatar.change')) + '</button>';
    }
    if (key === screenKey) return;
    screenKey = key;
    $('screen').innerHTML = html;
    if ($('avBtn')) $('avBtn').onclick = openAvatarModal;
  }

  /* ------------------------------ панель хоста ------------------------------ */
  function renderHost() {
    var panel = $('host');
    if (!P.me.isHost) { panel.classList.add('hidden'); hostKey = null; return; }
    var focused = document.activeElement;
    if (focused && panel.contains(focused) && /TEXTAREA|INPUT/.test(focused.tagName)) {
      if (!focused._waitBlur) { focused._waitBlur = true; focused.addEventListener('blur', function () { hostKey = null; if (P) renderHost(); }, { once: true }); }
      return;
    }
    panel.classList.remove('hidden');
    var ph = P.phase;
    var gameButtons = [];
    if (ph === 'game' && active && window.GAMES[active].play.hostButtons) gameButtons = window.GAMES[active].play.hostButtons(P) || [];
    var connected = P.players.filter(function (p) { return p.connected; }).length;
    var key = JSON.stringify([ph, P.paused, P.selected, connected, P.settings, gameButtons, lang,
      P.players.map(function (p) { return p.id + p.connected + p.name; })]);
    if (key === hostKey) return;
    hostKey = key;
    // В меню и на итогах панель раскрыта, во время игры — свёрнута, чтобы не мешать
    if (hostPhase !== ph) { hostPhase = ph; panel.open = ph !== 'game'; }

    var btn = function (id, label, cls, dis, data) {
      return '<button class="btn ' + (cls || '') + '" ' + (id ? 'id="' + id + '" ' : '') + (data || '') + (dis ? ' disabled' : '') + '>' + esc(label) + '</button>';
    };
    var rows = '';
    if (ph === 'menu') {
      var sel = P.games.find(function (g) { return g.id === P.selected; }) || P.games[0];
      rows += '<div class="pick-grid">' + P.games.map(function (g) {
        return '<button class="pick' + (g.id === P.selected ? ' sel' : '') + '" data-pick="' + g.id + '"><span>' + EMOJI[g.id] + '</span>' +
          esc(t('game.' + g.id)) + '<small>👥 ' + (g.label || g.min + '–' + g.max) + '</small></button>';
      }).join('') + '</div>';
      var ok = connected >= sel.min && connected <= sel.max;
      rows += btn('hStart', '▶ ' + t('host.start') + ': ' + t('game.' + sel.id), '', !ok);
      rows += btn('hRules', '📖 ' + t('host.rules') + ': ' + t('game.' + sel.id), 'sec', !ok);
      if (!ok) rows += '<p>' + esc(t('host.needRange', { min: sel.min, max: sel.max, n: connected })) + '</p>';
      if (P.cup.length) rows += btn('hEvening', '🏆 ' + t('host.evening'), 'sec');
    } else if (ph === 'game') {
      rows += '<div class="host-row">' + btn('hPause', P.paused ? '▶ ' + t('host.resume') : '⏸ ' + t('host.pause'), 'warn') +
        gameButtons.map(function (b, i) { return btn(null, b.label, b.cls || '', b.disabled, 'data-gb="' + i + '"'); }).join('') +
        btn('hMenu', t('host.toMenu'), 'sec') + '</div>';
    } else if (ph === 'rules') {
      rows += '<div class="host-row">' + btn('hSkip', '⏭ ' + t('rules.skip'), '') + btn('hMenu', t('host.toMenu'), 'sec') + '</div>';
    } else if (ph === 'podium') {
      rows += '<div class="host-row">' + btn('hAgain', '🔁 ' + t('host.again'), '') + btn('hMenu', '🎲 ' + t('host.otherGame'), 'sec') +
        btn('hEvening', '🏆 ' + t('host.evening'), 'warn') + '</div>';
    } else if (ph === 'evening') {
      rows += btn('hMenu', '🎲 ' + t('host.toMenu'), '');
    }
    var others = P.players.filter(function (p) { return p.id !== P.me.id; });
    var kick = others.length ? '<label class="f">' + esc(t('host.players')) + '</label><div class="kick-list">' + others.map(function (p) {
      return '<div class="kick-item">' + U.avatar(p) + '<span>' + esc(p.name) + '</span><button class="btn small danger" data-kick="' + p.id + '">' + esc(t('host.kick')) + '</button></div>';
    }).join('') + '</div>' : '';
    var opt = function (v, cur, label) { return '<option value="' + v + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + esc(label) + '</option>'; };
    var settings = '<label class="f">' + esc(t('host.lang')) + '</label><select class="t" id="hLang">' +
      opt('ru', P.settings.lang, t('lang.ru')) + opt('en', P.settings.lang, t('lang.en')) + '</select>' +
      '<label class="f">' + esc(t('host.pace')) + '</label><select class="t" id="hPace">' +
      opt('fast', P.settings.pace, t('pace.fast')) + opt('normal', P.settings.pace, t('pace.normal')) + opt('long', P.settings.pace, t('pace.long')) + '</select>' +
      '<label class="f">' + esc(t('host.duelTarget')) + '</label><select class="t" id="hDuel">' +
      [10, 15, 20].map(function (n) { return opt(n, P.settings.duelTarget, n); }).join('') + '</select>' +
      '<label class="chk"><input type="checkbox" id="hBig"' + (P.settings.big ? ' checked' : '') + '> ' + esc(t('host.big')) + '</label>' +
      '<label class="chk"><input type="checkbox" id="hContrast"' + (P.settings.contrast ? ' checked' : '') + '> ' + esc(t('host.contrast')) + '</label>' +
      '<label class="f">🐊 ' + esc(t('host.customWords')) + '</label>' +
      '<textarea class="t" id="hWords" rows="3" placeholder="' + esc(t('host.customHint')) + '">' + esc((P.settings.customWords || []).join(', ')) + '</textarea>' +
      '<select class="t" id="hWMode">' + opt('mix', P.settings.customMode, t('mode.mix')) + opt('only', P.settings.customMode, t('mode.only')) + '</select>' +
      btn('hWSave', t('host.saveWords') + ((P.settings.customWords || []).length ? ' · ' + t('host.wordsSaved', { n: P.settings.customWords.length }) : ''), 'sec small-full');
    panel.innerHTML = '<summary>👑 ' + esc(t('host.panel')) + '</summary>' + rows + kick +
      (ph === 'menu' ? btn('hBot', '🤖 ' + t('host.addBot'), 'sec small-full') : '') +
      '<label class="f">⚙️ ' + esc(t('host.settings')) + '</label>' + settings;

    var on = function (id, type) { var e = $(id); if (e) e.onclick = function () { ctx.host(type); }; };
    on('hStart', 'start'); on('hRules', 'rules'); on('hSkip', 'skipRules'); on('hPause', 'pause'); on('hMenu', 'menu'); on('hAgain', 'again'); on('hEvening', 'evening'); on('hBot', 'addBot');
    panel.querySelectorAll('[data-pick]').forEach(function (b) { b.onclick = function () { ctx.host('select', { gameId: b.dataset.pick }); }; });
    panel.querySelectorAll('[data-gb]').forEach(function (b) {
      b.onclick = function () { var g = gameButtons[+b.dataset.gb]; ctx.host(g.action, g.data); };
    });
    panel.querySelectorAll('[data-kick]').forEach(function (b) {
      b.onclick = function () {
        var p = U.playerById(P, b.dataset.kick);
        if (p && confirm(t('host.kick') + ': ' + p.name + '?')) ctx.host('kick', { playerId: p.id });
      };
    });
    $('hLang').onchange = function () { ctx.host('settings', { lang: this.value }); };
    $('hPace').onchange = function () { ctx.host('settings', { pace: this.value }); };
    $('hDuel').onchange = function () { ctx.host('settings', { duelTarget: this.value }); };
    $('hBig').onchange = function () { ctx.host('settings', { big: this.checked }); };
    $('hContrast').onchange = function () { ctx.host('settings', { contrast: this.checked }); };
    $('hWMode').onchange = function () { ctx.host('settings', { customMode: this.value }); };
    $('hWSave').onclick = function () { ctx.host('settings', { customWords: $('hWords').value }); };
  }

  if (!(ls.get('joined') === roomCode && roomCode)) renderJoin();
  else $('screen').innerHTML = msg('📡', t('play.joining'));
})();

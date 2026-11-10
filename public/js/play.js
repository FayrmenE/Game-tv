/* Экран телефона — оболочка платформы: вход, меню хоста, пьедестал. Игры — window.GAMES[*].play */
(function () {
  'use strict';
  var t = U.t, esc = U.esc;
  var socket = io();
  var P = null;
  var active = null, screenKey = null, hostKey = null, hostPhase = null, lang = null;
  var kicked = false, joining = false;
  var $ = function (id) { return document.getElementById(id); };
  var MODULE = { alien: 'alien', sniper: 'sniper', croc_solo: 'croc', croc_duel: 'croc' };
  var EMOJI = { alien: '👽', sniper: '🎯', croc_solo: '🐊', croc_duel: '⚔️' };

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
  socket.on('ping2', function (t0, ack) { if (ack) ack(); });
  socket.onAny(function (ev, data) {
    var i = ev.indexOf(':');
    if (i < 0) return;
    var g = window.GAMES[ev.slice(0, i)];
    if (g && g.play && g.play.onEvent && active === ev.slice(0, i)) g.play.onEvent(ev.slice(i + 1), data, P);
  });
  U.loadScenes().then(function () { screenKey = null; if (P) { unmountGame(); render(); } });

  function doJoin(name) {
    if (joining) return;
    joining = true;
    socket.emit('player:join', { room: roomCode, name: name, token: token });
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
      '<button class="btn" id="go">' + esc(t('play.enter')) + '</button></div>';
    var go = function () {
      var name = $('nm').value.trim();
      roomCode = $('rc').value.trim().toUpperCase();
      if (!name) return showErr(t('err.badName'));
      ls.set('name', name);
      doJoin(name);
    };
    $('go').onclick = go;
    $('nm').onkeydown = $('rc').onkeydown = function (e) { if (e.key === 'Enter') go(); };
    if (!$('nm').value) $('nm').focus();
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
    if (P.phase === 'podium') {
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
      key = 'menu:' + P.selected + ':' + P.me.isHost + lang;
      html = P.me.isHost ? msg(EMOJI[P.selected] || '🎉', t('menu.youPick'), t('menu.youPickSub'))
        : msg(EMOJI[P.selected] || '🎉', t('menu.waitHost'), t('game.' + P.selected));
    }
    if (key === screenKey) return;
    screenKey = key;
    $('screen').innerHTML = html;
  }

  /* ------------------------------ панель хоста ------------------------------ */
  function renderHost() {
    var panel = $('host');
    if (!P.me.isHost) { panel.classList.add('hidden'); hostKey = null; return; }
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
          esc(t('game.' + g.id)) + '<small>👥 ' + g.min + '–' + g.max + '</small></button>';
      }).join('') + '</div>';
      var ok = connected >= sel.min && connected <= sel.max;
      rows += btn('hStart', '▶ ' + t('host.start') + ': ' + t('game.' + sel.id), '', !ok);
      if (!ok) rows += '<p>' + esc(t('host.needRange', { min: sel.min, max: sel.max, n: connected })) + '</p>';
      if (P.cup.length) rows += btn('hEvening', '🏆 ' + t('host.evening'), 'sec');
    } else if (ph === 'game') {
      rows += '<div class="host-row">' + btn('hPause', P.paused ? '▶ ' + t('host.resume') : '⏸ ' + t('host.pause'), 'warn') +
        gameButtons.map(function (b, i) { return btn(null, b.label, b.cls || '', b.disabled, 'data-gb="' + i + '"'); }).join('') +
        btn('hMenu', t('host.toMenu'), 'sec') + '</div>';
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
      [10, 15, 20].map(function (n) { return opt(n, P.settings.duelTarget, n); }).join('') + '</select>';
    panel.innerHTML = '<summary>👑 ' + esc(t('host.panel')) + '</summary>' + rows + kick +
      (ph === 'menu' ? btn('hBot', '🤖 ' + t('host.addBot'), 'sec small-full') : '') +
      '<label class="f">⚙️ ' + esc(t('host.settings')) + '</label>' + settings;

    var on = function (id, type) { var e = $(id); if (e) e.onclick = function () { ctx.host(type); }; };
    on('hStart', 'start'); on('hPause', 'pause'); on('hMenu', 'menu'); on('hAgain', 'again'); on('hEvening', 'evening'); on('hBot', 'addBot');
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
  }

  if (!(ls.get('joined') === roomCode && roomCode)) renderJoin();
  else $('screen').innerHTML = msg('📡', t('play.joining'));
})();

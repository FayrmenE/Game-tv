/* Экран ТВ — оболочка платформы: меню, пьедестал, итоги вечера, кубок. Игры — window.GAMES[*].tv */
(function () {
  'use strict';
  var t = U.t, esc = U.esc;
  var socket = io();
  var P = null;
  var active = null;      // ключ модуля игры, который сейчас отрисован
  var shellKey = null;    // ключ последней отрисовки экрана оболочки
  var lang = null;
  var $ = function (id) { return document.getElementById(id); };
  var params = new URLSearchParams(location.search);

  var MODULE = { alien: 'alien', sniper: 'sniper', croc_solo: 'croc', croc_duel: 'croc', telepathy: 'telepathy', battleship: 'battleship', doodle: 'doodle' };
  var EMOJI = { alien: '👽', sniper: '🎯', croc_solo: '🐊', croc_duel: '⚔️', telepathy: '🔮', battleship: '🚢', doodle: '🖍️' };
  // Фазы, при входе в которые на ТВ на секунду всплывает крупная заставка
  var BANNER_PHASES = { alien: ['look', 'words', 'discuss', 'lastword', 'revote', 'runoff', 'reveal', 'lastchance'], telepathy: ['clue', 'guess'] };
  var lastBannerKey = null;
  window.SHELL = { EMOJI: EMOJI, MODULE: MODULE };

  socket.on('connect', function () {
    var code = null;
    try { code = sessionStorage.getItem('party.tv.code'); } catch (e) { /* ignore */ }
    socket.emit('tv:hello', { code: code, bots: params.get('bots') });
  });
  socket.on('state', function (s) {
    P = s;
    try { sessionStorage.setItem('party.tv.code', s.code); } catch (e) { /* ignore */ }
    render();
  });
  socket.on('timer', U.onTimer);
  socket.on('sfx', function (k) { SFX.play(k); });
  socket.on('avatars', function (m) { U.setAvatars(m); shellKey = null; render(); });
  socket.on('react', floatReaction);
  socket.on('ping2', function (t0, ack) { if (ack) ack(); });
  // События конкретной игры («sniper:img», «croc:ops» …) отдаём её модулю
  socket.onAny(function (ev, data) {
    var i = ev.indexOf(':');
    if (i < 0 || ev === 'tv:hello') return;
    var g = window.GAMES[ev.slice(0, i)];
    if (g && g.tv && g.tv.onEvent && active === ev.slice(0, i)) g.tv.onEvent(ev.slice(i + 1), data, P);
  });
  U.loadScenes().then(function () { shellKey = null; if (P) { unmountGame(); render(); } });

  // Кнопка включения звука (браузер не даёт играть звук без клика)
  var snd = $('soundBtn');
  snd.onclick = function () { SFX.unlock(); SFX.play('ok'); snd.classList.add('hidden'); };
  setInterval(function () { if (SFX.ready()) snd.classList.add('hidden'); }, 1000);

  /* ------------------------------ реакции эмодзи ------------------------------ */
  function floatReaction(d) {
    var layer = $('reactLayer');
    if (!layer || !P) return;
    var p = U.playerById(P, d.id) || { name: '', color: '#888' };
    var el = document.createElement('div');
    el.className = 'react';
    el.style.left = (8 + Math.random() * 84) + '%';
    el.style.setProperty('--c', p.color);
    el.innerHTML = '<span class="re">' + d.e + '</span><span class="rn">' + esc(p.name) + '</span>';
    layer.appendChild(el);
    setTimeout(function () { el.remove(); }, 3200);
    while (layer.children.length > 40) layer.firstChild.remove();
  }

  /* ------------------------------ конфетти ------------------------------ */
  function confetti() {
    var layer = $('reactLayer');
    var colors = ['#ffd60a', '#ff595e', '#8ac926', '#1982c4', '#f15bb5', '#ffffff'];
    for (var i = 0; i < 120; i++) {
      var c = document.createElement('i');
      c.className = 'confetti';
      c.style.left = Math.random() * 100 + '%';
      c.style.background = colors[i % colors.length];
      c.style.animationDelay = (Math.random() * 0.8) + 's';
      c.style.animationDuration = (2.2 + Math.random() * 1.6) + 's';
      c.style.transform = 'rotate(' + Math.random() * 360 + 'deg)';
      layer.appendChild(c);
      (function (n) { setTimeout(function () { n.remove(); }, 4600); })(c);
    }
  }
  window.SHELL.confetti = confetti;

  /* ------------------------------ заставки фаз и тиканье ------------------------------ */
  function phaseBanner() {
    var g = P.game, list = BANNER_PHASES[MODULE[P.gameId]];
    if (!g || !list || list.indexOf(g.phase) < 0) return;
    var key = P.gameId + ':' + (g.roundNo || g.turnNo || 0) + ':' + g.phase + ':' + (g.round && g.round.turn ? g.round.turn.c : '');
    if (key === lastBannerKey) return;
    var first = lastBannerKey === null;
    lastBannerKey = key;
    if (first) return;
    var b = $('phaseBanner');
    b.innerHTML = '<div>' + esc($('phaseTitle').textContent.replace(/^.*·\s*/, '')) + '</div>';
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
  }
  var lastTickSec = null;
  setInterval(function () {
    if (!P || (P.phase !== 'game' && P.phase !== 'rules') || P.paused) { lastTickSec = null; return; }
    if (U.timerTotal() < 8000) return;
    var sec = Math.ceil(U.timeLeft() / 1000);
    if (sec <= 5 && sec >= 1 && sec !== lastTickSec) SFX.play('tick');
    lastTickSec = sec;
  }, 100);

  function unmountGame() {
    if (active && window.GAMES[active] && window.GAMES[active].tv.unmount) window.GAMES[active].tv.unmount();
    active = null;
    $('main').innerHTML = '';
    $('strip').innerHTML = '';
    $('strip').classList.remove('hidden');
    document.body.className = 'tv';
  }

  function render() {
    if (!P) return;
    if (lang !== P.settings.lang) { lang = P.settings.lang; i18n.setLang(lang); shellKey = null; }
    document.title = t('platform.title') + ' — TV';
    document.documentElement.classList.toggle('big', !!P.settings.big);
    document.documentElement.classList.toggle('contrast', !!P.settings.contrast);
    $('roomChip').innerHTML = '<small>' + esc(t('tv.roomCode')) + '</small>' + esc(P.code);
    renderCup();
    if (P.phase === 'game' && P.game && MODULE[P.gameId]) {
      var key = MODULE[P.gameId];
      if (active !== key) { unmountGame(); active = key; shellKey = null; document.body.className = 'tv game-' + key; }
      $('brandName').textContent = t('game.' + P.gameId);
      $('brandIcon').textContent = EMOJI[P.gameId];
      window.GAMES[key].tv.render(P);
      phaseBanner();
      return;
    }
    lastBannerKey = null;
    if (active) unmountGame();
    $('brandName').textContent = t('platform.title');
    $('brandIcon').textContent = '🎉';
    if (P.phase === 'rules') renderRules();
    else if (P.phase === 'podium') renderPodium();
    else if (P.phase === 'evening') renderEvening();
    else renderMenu();
  }

  /* ------------------------------ кубок вечера (всегда в углу) ------------------------------ */
  function renderCup() {
    var el = $('cup');
    var rows = P.cup.filter(function (c) { return c.points > 0; }).slice(0, 5);
    if (!rows.length) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.innerHTML = '<div class="cup-h">🏆 ' + esc(t('cup.title')) + '</div>' + rows.map(function (c, i) {
      return '<div class="cup-row"><span class="cup-pl">' + (i + 1) + '</span>' + U.avatar(c) + '<span class="cup-nm">' + esc(c.name) + '</span><b>' + c.points + '</b></div>';
    }).join('');
  }

  /* ------------------------------ меню ------------------------------ */
  function renderMenu() {
    $('phaseTitle').textContent = t('menu.title');
    $('phaseSub').textContent = t('menu.sub');
    var key = JSON.stringify([lang, P.selected, P.players, P.hostId, !!P.qr]);
    if (key === shellKey) return;
    shellKey = key;
    var host = U.playerById(P, P.hostId);
    var n = P.players.filter(function (p) { return p.connected; }).length;
    $('main').innerHTML =
      '<div class="lobby">' +
      '<div class="qr-card">' +
      (P.qr ? '<img alt="QR" src="' + P.qr + '">' : '<div style="height:20em"></div>') +
      '<div class="code">' + esc(P.code) + '</div>' +
      '<div class="url">' + esc(P.joinUrl || '') + '</div></div>' +
      '<div class="lobby-info">' +
      '<div class="game-cards">' + P.games.map(function (g) {
        var ok = n >= g.min && n <= g.max;
        return '<div class="game-card' + (g.id === P.selected ? ' sel' : '') + (ok ? '' : ' dim') + '">' +
          '<div class="gc-emoji">' + EMOJI[g.id] + '</div><div class="gc-name">' + esc(t('game.' + g.id)) + '</div>' +
          '<div class="gc-desc">' + esc(t('game.' + g.id + '.desc')) + '</div>' +
          '<div class="gc-players">👥 ' + (g.label || g.min + '–' + g.max) + '</div></div>';
      }).join('') + '</div>' +
      '<div class="lobby-note">📱 ' + esc(t('tv.scan')) + ' · ' + esc(t('tv.sameWifi')) + '</div>' +
      '<div class="lobby-players">' + P.players.map(function (p) {
        return '<div class="lobby-player">' + U.avatar(p) + '<b>' + esc(p.name) + '</b>' +
          '<span class="crown">' + (p.id === P.hostId ? '👑 ' + esc(t('play.host')) : '&nbsp;') + '</span></div>';
      }).join('') + '</div>' +
      '<div class="lobby-note">' + esc(host ? t('menu.hostPicks', { name: host.name }) : t('tv.noPlayers')) + '</div>' +
      (n < 3 ? '<div class="lobby-note hint">🤖 ' + esc(t('menu.addBotHint')) + '</div>' : '') +
      '<div class="lobby-note small">🛠 ' + esc(t('menu.check', { url: (P.joinUrl || '').replace(/\/play.*$/, '/check') })) + '</div>' +
      '</div></div>';
  }

  /* ------------------------------ правила ------------------------------ */
  function renderRules() {
    var id = P.rulesFor;
    document.body.className = 'tv game-' + (MODULE[id] || '');
    $('brandName').textContent = t('game.' + id);
    $('brandIcon').textContent = EMOJI[id];
    $('phaseTitle').textContent = t('rules.title') + ' · ' + t('game.' + id);
    $('phaseSub').textContent = t('rules.hostSkip');
    var key = 'rules:' + id + lang;
    if (key === shellKey) return;
    shellKey = key;
    var steps = [1, 2, 3, 4].map(function (i) { return t('rules.' + id + '.' + i).split('|'); });
    $('main').innerHTML = '<div class="rules"><h1>' + EMOJI[id] + ' ' + esc(t('game.' + id)) + '</h1><div class="rules-grid">' +
      steps.map(function (st, i) {
        return '<div class="rule" style="animation-delay:' + (i * 0.35) + 's"><div class="rule-n">' + (i + 1) + '</div><div class="rule-ic">' + st[0] + '</div><div class="rule-t">' + esc(st[1] || '') + '</div></div>';
      }).join('') + '</div><div class="timer-track rules-track"><div class="js-timer-bar"></div></div></div>';
  }

  /* ------------------------------ пьедестал ------------------------------ */
  function renderPodium() {
    var R = P.result;
    $('phaseTitle').textContent = t('podium.title') + ' · ' + t('game.' + R.gameId);
    $('phaseSub').textContent = t('podium.sub');
    var key = JSON.stringify([lang, 'podium', R]);
    if (key === shellKey) return;
    shellKey = key;
    SFX.play('win');
    confetti();
    var steps = R.places.slice(0, 3);
    var order = [1, 0, 2].filter(function (i) { return steps[i]; });
    var teamOf = function (ids) {
      if (!R.teams) return null;
      return R.teams.find(function (tm) { return tm.ids.some(function (id) { return ids.indexOf(id) >= 0; }); });
    };
    var podium = '<div class="podium">' + order.map(function (i) {
      var s = steps[i], tm = teamOf(s.ids);
      var who = tm ? '<div class="pod-team" style="--c:' + tm.color + '">' + esc(t(tm.name)) + '</div>' : '';
      return '<div class="pod pod' + s.place + '">' + who + '<div class="pod-people">' + s.ids.map(function (id) {
        var p = U.playerById(P, id) || { name: '?', color: '#888' };
        return '<div class="pod-p">' + U.avatar(p) + '<b>' + esc(p.name) + '</b><span>' + (R.scores[id] != null && !tm ? R.scores[id] : '') + '</span></div>';
      }).join('') + '</div><div class="pod-step"><span>' + s.place + '</span>' +
        (tm ? '<small>' + tm.score + '</small>' : '') + '<em>+' + (R.cupDelta[s.ids[0]] || 0) + ' 🏆</em></div></div>';
    }).join('') + '</div>';
    var titles = R.titles.length ? '<div class="titles">' + R.titles.map(function (tt) {
      var p = U.playerById(P, tt.playerId) || { name: '?', color: '#888' };
      return '<div class="title-card"><div class="tt-name">🏅 ' + esc(t(tt.key, tt.vars)) + '</div><div class="tt-who">' + U.avatar(p) + esc(p.name) +
        (tt.text ? ' — «' + esc(tt.text) + '»' : '') + '</div></div>';
    }).join('') + '</div>' : '';
    var rest = R.places.slice(3).map(function (s) {
      return s.ids.map(function (id) { var p = U.playerById(P, id); return p ? '<span>' + s.place + '. ' + esc(p.name) + ' · ' + (R.scores[id] || 0) + '</span>' : ''; }).join('');
    }).join('');
    $('main').innerHTML = '<div class="podium-wrap">' + podium + titles + (rest ? '<div class="rest">' + rest + '</div>' : '') +
      '<div class="lobby-note">' + esc(t('podium.hostNext')) + '</div></div>';
  }

  /* ------------------------------ итоги вечера ------------------------------ */
  function renderEvening() {
    $('phaseTitle').textContent = t('evening.title');
    $('phaseSub').textContent = '';
    var key = JSON.stringify([lang, 'evening', P.cup]);
    if (key === shellKey) return;
    shellKey = key;
    SFX.play('win');
    confetti();
    setTimeout(confetti, 1500);
    var champ = P.cup[0];
    $('main').innerHTML = '<div class="evening">' +
      (champ && champ.points > 0 ? '<div class="champ"><div class="crown-big">👑</div>' + U.avatar(champ, 'big') +
        '<h1>' + esc(t('evening.champion', { name: champ.name })) + '</h1><div class="lobby-note">' + esc(t('evening.points', { n: champ.points })) + '</div></div>'
        : '<h1>' + esc(t('evening.empty')) + '</h1>') +
      '<div class="scoreboard">' + P.cup.map(function (c, i) {
        return '<div class="sc">' + (i + 1) + '. ' + U.avatar(c) + esc(c.name) + ' · ' + c.points + ' 🏆</div>';
      }).join('') + '</div></div>';
  }
})();

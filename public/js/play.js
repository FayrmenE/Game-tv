/* Экран телефона */
(function () {
  'use strict';
  var t = U.t, esc = U.esc;
  var socket = io();
  var S = null;
  var screenKey = null, hostKey = null, hostPhase = null, lang = null;
  var joined = false, kicked = false, joining = false;
  var guessSel = null;
  var $ = function (id) { return document.getElementById(id); };

  var params = new URLSearchParams(location.search);
  var store = {
    get: function (k) { try { return sessionStorage.getItem('alien.' + k) || localStorage.getItem('alien.' + k); } catch (e) { return null; } },
    set: function (k, v) { try { sessionStorage.setItem('alien.' + k, v); if (k === 'name') localStorage.setItem('alien.name', v); } catch (e) { /* ignore */ } }
  };
  // clientId живёт в sessionStorage: переживает перезагрузку вкладки,
  // но разные вкладки — разные игроки (удобно для тестов на одном компьютере).
  var clientId = (function () {
    try {
      var id = sessionStorage.getItem('alien.clientId');
      if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem('alien.clientId', id); }
      return id;
    } catch (e) { return Math.random().toString(36).slice(2); }
  })();
  var roomCode = (params.get('room') || store.get('room') || '').toUpperCase();

  function showErr(msg) {
    var e = $('err');
    e.textContent = msg;
    e.classList.toggle('hidden', !msg);
    if (msg) setTimeout(function () { if (e.textContent === msg) e.classList.add('hidden'); }, 4000);
  }

  /* ------------------------------ сокет ------------------------------ */
  socket.on('connect', function () {
    $('conn').classList.add('hidden');
    if (store.get('joined:' + roomCode) && roomCode && !kicked) doJoin(store.get('name'));
  });
  socket.on('disconnect', function () { $('conn').textContent = t('play.disconnected'); $('conn').classList.remove('hidden'); });
  socket.on('joined', function (d) { joined = true; joining = false; roomCode = d.room; store.set('room', d.room); store.set('joined:' + d.room, '1'); });
  socket.on('errorMsg', function (e) {
    joining = false;
    if (e.key === 'err.noRoom') { joined = false; store.set('joined:' + roomCode, ''); screenKey = null; renderJoin(); }
    showErr(t(e.key, e.vars));
  });
  socket.on('kicked', function () {
    kicked = true; joined = false; S = null; store.set('joined:' + roomCode, '');
    screenKey = null; $('host').classList.add('hidden'); $('top').classList.add('hidden');
    $('screen').innerHTML = '<div class="card big-msg"><div class="emoji">🚪</div><h2>' + esc(t('play.kicked')) + '</h2>' +
      '<button class="btn" id="rejoin">' + esc(t('play.rejoin')) + '</button></div>';
    $('rejoin').onclick = function () { kicked = false; renderJoin(); };
  });
  socket.on('state', function (s) { if (kicked) return; S = s; render(); });
  socket.on('timer', U.onTimer);
  U.loadScenes().then(function () { screenKey = null; if (S) render(); });

  function doJoin(name) {
    if (joining) return;
    joining = true;
    socket.emit('player:join', { room: roomCode, name: name, clientId: clientId });
    setTimeout(function () { joining = false; }, 3000);
  }

  /* ------------------------------ вход ------------------------------ */
  function renderJoin() {
    $('top').classList.add('hidden');
    $('host').classList.add('hidden');
    $('screen').innerHTML = '<div class="card"><h2>👽 ' + esc(t('play.join')) + '</h2>' +
      '<label class="f" for="nm">' + esc(t('play.yourName')) + '</label>' +
      '<input class="t" id="nm" maxlength="16" autocomplete="nickname" value="' + esc(store.get('name') || '') + '">' +
      '<label class="f" for="rc">' + esc(t('play.room')) + '</label>' +
      '<input class="t code" id="rc" maxlength="4" autocapitalize="characters" value="' + esc(roomCode) + '">' +
      '<button class="btn" id="go">' + esc(t('play.enter')) + '</button></div>';
    var go = function () {
      var name = $('nm').value.trim();
      roomCode = $('rc').value.trim().toUpperCase();
      if (!name) return showErr(t('err.badName'));
      store.set('name', name);
      doJoin(name);
    };
    $('go').onclick = go;
    $('nm').onkeydown = $('rc').onkeydown = function (e) { if (e.key === 'Enter') go(); };
    if (!$('nm').value) $('nm').focus();
  }

  /* ------------------------------ основной рендер ------------------------------ */
  function render() {
    if (!S || !S.me) return;
    if (lang !== S.settings.lang) { lang = S.settings.lang; i18n.setLang(lang); screenKey = null; hostKey = null; }
    document.title = t('app.title');
    renderTop();
    renderScreen();
    renderHost();
  }

  function renderTop() {
    var me = S.me;
    var top = $('top');
    top.classList.remove('hidden');
    top.innerHTML = U.avatar(me) + '<div class="who">' + esc(me.name) + (me.isHost ? ' 👑' : '') +
      '<small>' + esc(t('play.room')) + ': ' + esc(S.code) + (S.roundNo ? ' · ' + esc(t('tv.round', { n: S.roundNo })) : '') + '</small></div>' +
      '<div class="timer js-timer"></div>';
  }

  function msg(emoji, title, sub) {
    return '<div class="card big-msg"><div class="emoji">' + emoji + '</div><h2>' + esc(title) + '</h2>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>';
  }

  function renderScreen() {
    var r = S.round, ph = S.phase, me = S.me, priv = S.priv || {};
    var key, html, after;

    if (ph === 'lobby' || !r) {
      var notice = S.notice ? t(S.notice.key, { reason: t(S.notice.reasonKey) }) : '';
      key = 'lobby:' + notice + ':' + S.players.length;
      html = (notice ? '<div class="err">' + esc(notice) + '</div>' : '') +
        msg('📺', t('play.waitingStart'), t('tv.waitingPlayers', { n: S.players.length, min: S.minPlayers, max: S.maxPlayers }));
    } else if (!me.inRound && ph !== 'roundEnd') {
      key = 'out';
      html = msg('⏳', t('play.notInRound'), t('play.lookTv'));
    } else if (ph === 'look') {
      key = 'look:' + S.roundNo + ':' + (priv.item && priv.item.id);
      var it = priv.item;
      html = '<div class="card"><h2>' + esc(t('phase.look')) + '</h2><p>' + esc(t('play.dontShow')) + '</p></div>' +
        '<button class="hold-btn" id="hold"><div><span class="eye">👁</span>' + esc(t('play.holdBtn')) + '<br><small style="font-size:15px;opacity:.8">' + esc(t('play.hold')) + '</small></div>' +
        (it ? '<div class="reveal">' + ART.itemSvg(it.id) + '<div class="num">' + esc(t('play.yourItem', { num: it.num })) + '</div><div class="nm">' + esc(t('item.' + it.id)) + '</div></div>' : '') +
        '</button>';
      after = bindHold;
    } else if (ph === 'words') {
      var mine = r.turn && r.turn.id === me.id;
      var myW = (r.words[me.id] || []).map(function (w) { return typeof w === 'string' ? w : (w === false ? '—' : null); }).filter(Boolean);
      key = 'words:' + r.turn.id + ':' + r.turn.c + ':' + myW.join('|');
      var wordsHtml = myW.length ? '<div class="my-words">' + myW.map(function (w) { return '<div>' + esc(w) + '</div>'; }).join('') + '</div>' : '';
      if (mine) {
        html = '<div class="card"><h2>✍️ ' + esc(t('play.yourTurn')) + '</h2>' +
          '<input class="t" id="word" maxlength="20" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="' + esc(t('play.wordPh')) + '">' +
          '<button class="btn" id="send">' + esc(t('play.send')) + '</button>' +
          '<div class="timer-track" style="margin-top:14px"><div class="js-timer-bar"></div></div>' + wordsHtml + '</div>';
        after = bindWord;
      } else {
        html = msg('🗣️', t('play.waitTurn', { name: U.nameOf(S, r.turn.id) }), t('play.lookTv')) +
          (wordsHtml ? '<div class="card">' + wordsHtml + '</div>' : '');
      }
    } else if (['discuss', 'revote', 'runoff', 'lastword'].indexOf(ph) >= 0) {
      var frozen = r.frozen || ph === 'lastword' || S.paused;
      var cands = (ph === 'runoff' && r.candidates ? r.candidates : r.participants).filter(function (id) { return id !== me.id; });
      key = 'vote:' + ph + ':' + frozen + ':' + priv.myVote + ':' + cands.join(',') + ':' + r.speakerId;
      var head;
      if (ph === 'lastword') head = r.speakerId === me.id ? '🎤 ' + t('play.speakNow') : '🤫 ' + t('play.listen', { name: U.nameOf(S, r.speakerId) });
      else if (ph === 'runoff') head = t('play.voteRunoff');
      else if (ph === 'revote') head = t('phase.revote');
      else head = t('play.voteTitle');
      html = '<div class="card"><h2>' + esc(head) + '</h2><p>' + esc(frozen ? '❄ ' + t('play.voteFrozen') :
        (priv.myVote ? t('play.yourVote', { name: U.nameOf(S, priv.myVote) }) : t('play.noVote'))) + '</p></div>' +
        '<div class="vote-list">' + cands.map(function (id) {
          var p = U.playerById(S, id);
          return '<button class="vote-btn' + (priv.myVote === id ? ' sel' : '') + '" data-id="' + id + '"' + (frozen ? ' disabled' : '') + '>' + U.avatar(p) + '<span>' + esc(p.name) + '</span></button>';
        }).join('') + '</div>';
      after = bindVote;
    } else if (ph === 'reveal') {
      key = 'reveal';
      html = msg('🥁', t('play.reveal'), t('play.lookTv'));
    } else if (ph === 'lastchance') {
      if (priv.guessing) {
        key = 'guess:' + S.roundNo + ':' + guessSel;
        html = guessHtml();
        after = bindGuess;
      } else {
        key = 'lastchance';
        html = msg('👽', t('play.alienGuessing'), t('play.lookTv'));
      }
    } else if (ph === 'roundEnd') {
      var wasAlien = r.alienId === me.id;
      var alienWon = r.outcome !== 'civilians_win';
      var won = wasAlien ? alienWon : !alienWon;
      var d = r.deltas[me.id] || 0;
      key = 'end:' + S.roundNo;
      html = msg(won ? '🎉' : '😵', won ? t('play.youWin') : t('play.youLose'),
        (wasAlien ? t('play.youWereAlien') : t('play.youWereCivil')) + (d ? ' · ' + t('outcome.points', { n: d }) : '')) +
        '<div class="card"><p>' + esc(t('outcome.' + r.outcome)) + '</p></div>';
    } else { key = ph; html = msg('📺', t('play.lookTv')); }

    if (key === screenKey) return;
    screenKey = key;
    $('screen').innerHTML = html;
    if (after) after();
  }

  /* ------------------------------ взаимодействие ------------------------------ */
  function bindHold() {
    var b = $('hold');
    if (!b) return;
    var on = function (e) { e.preventDefault(); b.classList.add('holding'); socket.emit('player:looked'); if (b.setPointerCapture && e.pointerId != null) try { b.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } };
    var off = function () { b.classList.remove('holding'); };
    b.addEventListener('pointerdown', on);
    ['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture'].forEach(function (ev) { b.addEventListener(ev, off); });
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    window.addEventListener('blur', off);
    document.addEventListener('visibilitychange', off);
  }

  function bindWord() {
    var inp = $('word'), send = $('send');
    var go = function () {
      var w = inp.value.trim();
      if (!w || /\s/.test(w) || Array.from(w).length > 20) return showErr(t('err.badWord'));
      send.disabled = true;
      socket.emit('player:word', { word: w });
      setTimeout(function () { send.disabled = false; }, 1500);
    };
    inp.addEventListener('input', function () { var v = inp.value.replace(/\s+/g, ''); if (v !== inp.value) inp.value = v; });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    send.onclick = go;
    inp.focus();
    try { navigator.vibrate && navigator.vibrate(200); } catch (e) { /* ignore */ }
  }

  function bindVote() {
    var btns = document.querySelectorAll('.vote-btn');
    for (var i = 0; i < btns.length; i++) btns[i].onclick = function () {
      socket.emit('player:vote', { targetId: this.dataset.id });
    };
  }

  function guessHtml() {
    var sc = U.scene(S.round.sceneId);
    if (!sc) return '';
    var sel = guessSel && sc.items.find(function (i) { return i.id === guessSel; });
    return '<div class="card"><h2>👽 ' + esc(t('play.caught')) + '</h2><p>' + esc(t('play.guessHint')) + '</p></div>' +
      '<div class="guess-scene" id="gscene">' + ART.sceneSvg(sc) + '</div>' +
      (sel ? '<div class="card" style="margin-top:12px"><h2>' + esc(t('play.guessConfirm', { num: sel.num, name: t('item.' + sel.id) })) + '</h2>' +
        '<button class="btn warn" id="confirm">' + esc(t('play.confirm')) + '</button></div>' : '') +
      '<div class="thumbs">' + sc.items.map(function (i) {
        return '<button class="thumb' + (i.id === guessSel ? ' sel' : '') + '" data-item="' + i.id + '"><b>' + i.num + '</b>' + ART.itemSvg(i.id) + '</button>';
      }).join('') + '</div>';
  }

  function bindGuess() {
    var choose = function (id) { guessSel = id; screenKey = null; render(); };
    var gs = $('gscene');
    if (gs) {
      gs.addEventListener('click', function (e) { var g = e.target.closest('.scene-item'); if (g) choose(g.dataset.item); });
      if (guessSel) { var g = document.getElementById('item-' + guessSel); if (g) g.classList.add('sel'); }
    }
    var th = document.querySelectorAll('.thumb');
    for (var i = 0; i < th.length; i++) th[i].onclick = function () { choose(this.dataset.item); };
    var c = $('confirm');
    if (c) c.onclick = function () { c.disabled = true; socket.emit('player:guess', { itemId: guessSel }); };
  }

  /* ------------------------------ панель хоста ------------------------------ */
  function renderHost() {
    var panel = $('host');
    if (!S.me.isHost) { panel.classList.add('hidden'); hostKey = null; return; }
    panel.classList.remove('hidden');
    var ph = S.phase, r = S.round;
    // В лобби и на итогах панель раскрыта, во время раунда — свёрнута, чтобы не мешать
    if (hostPhase !== ph) { hostPhase = ph; panel.open = ph === 'lobby' || ph === 'roundEnd' || !r; }
    var connected = S.players.filter(function (p) { return p.connected; }).length;
    var key = [ph, S.paused, r && r.plus30Used, connected, S.settings.lang, S.settings.pace,
      S.players.map(function (p) { return p.id + p.connected + p.name; }).join(',')].join('|');
    if (key === hostKey) return;
    hostKey = key;
    var btn = function (id, label, cls, dis) { return '<button class="btn ' + (cls || '') + '" id="' + id + '"' + (dis ? ' disabled' : '') + '>' + esc(label) + '</button>'; };
    var rows = '';
    if (ph === 'lobby' || !r) {
      var enough = connected >= S.minPlayers;
      rows += btn('hStart', '▶ ' + t('host.start'), '', !enough);
      if (!enough) rows += '<p>' + esc(t('host.needPlayers', { min: S.minPlayers, n: connected })) + '</p>';
    } else if (ph === 'roundEnd') {
      rows += '<div class="host-row">' + btn('hNext', '▶ ' + t('host.next')) + btn('hLobby', t('host.toLobby'), 'sec') + '</div>';
    } else {
      rows += '<div class="host-row">' +
        btn('hPause', S.paused ? '▶ ' + t('host.resume') : '⏸ ' + t('host.pause'), 'warn') +
        btn('hPlus', r.plus30Used ? t('host.plus30used') : t('host.plus30'), 'sec', r.plus30Used) +
        btn('hLobby', t('host.toLobby'), 'sec') + '</div>';
    }
    var others = S.players.filter(function (p) { return p.id !== S.me.id; });
    var kick = others.length ? '<label class="f">' + esc(t('host.players')) + '</label><div class="kick-list">' + others.map(function (p) {
      return '<div class="kick-item">' + U.avatar(p) + '<span>' + esc(p.name) + '</span><button class="btn small danger" data-kick="' + p.id + '">' + esc(t('host.kick')) + '</button></div>';
    }).join('') + '</div>' : '';
    var opt = function (v, cur, label) { return '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + esc(label) + '</option>'; };
    var settings = '<label class="f">' + esc(t('host.lang')) + '</label><select class="t" id="hLang">' +
      opt('ru', S.settings.lang, t('lang.ru')) + opt('en', S.settings.lang, t('lang.en')) + '</select>' +
      '<label class="f">' + esc(t('host.pace')) + '</label><select class="t" id="hPace">' +
      opt('fast', S.settings.pace, t('pace.fast')) + opt('normal', S.settings.pace, t('pace.normal')) + opt('long', S.settings.pace, t('pace.long')) + '</select>';
    panel.innerHTML = '<summary>👑 ' + esc(t('host.panel')) + '</summary>' + rows + kick +
      '<label class="f">⚙️ ' + esc(t('host.settings')) + '</label>' + settings;
    var on = function (id, ev) { var e = $(id); if (e) e.onclick = function () { socket.emit(ev); }; };
    on('hStart', 'host:start'); on('hNext', 'host:next'); on('hPause', 'host:pause'); on('hPlus', 'host:plus30'); on('hLobby', 'host:lobby');
    var ks = panel.querySelectorAll('[data-kick]');
    for (var i = 0; i < ks.length; i++) ks[i].onclick = function () {
      var p = U.playerById(S, this.dataset.kick);
      if (p && confirm(t('host.kick') + ': ' + p.name + '?')) socket.emit('host:kick', { playerId: p.id });
    };
    $('hLang').onchange = function () { socket.emit('host:settings', { lang: this.value }); };
    $('hPace').onchange = function () { socket.emit('host:settings', { pace: this.value }); };
  }

  // Старт: если уже в игре — сокет сам переподключит; иначе форма входа
  if (!(store.get('joined:' + roomCode) && roomCode)) renderJoin();
  else $('screen').innerHTML = msg('📡', t('play.joining'));
})();

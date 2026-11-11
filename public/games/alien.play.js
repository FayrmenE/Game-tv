/* «Чужой» — экран телефона (модуль игры для оболочки public/js/play.js) */
(function () {
  'use strict';
  var t = U.t, esc = U.esc;
  var S = null, el = null, ctx = null;
  var screenKey = null, lang = null;
  var guessSel = null, guessRound = null;
  var $ = function (id) { return document.getElementById(id); };

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
          '<input class="t" id="word" maxlength="16" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="' + esc(t('play.wordPh')) + '">' +
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
        if (guessRound !== S.roundNo) { guessRound = S.roundNo; guessSel = null; }
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
    el.innerHTML = html;
    if (after) after();
  }

  /* ------------------------------ взаимодействие ------------------------------ */
  function bindHold() {
    var b = $('hold');
    if (!b) return;
    var on = function (e) { e.preventDefault(); b.classList.add('holding'); ctx.act('looked'); if (b.setPointerCapture && e.pointerId != null) try { b.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } };
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
      if (!w || /\s/.test(w) || Array.from(w).length > 16) return ctx.showErr(t('err.badWord'));
      send.disabled = true;
      ctx.act('word', { word: w });
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
      ctx.act('vote', { targetId: this.dataset.id });
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
    var choose = function (id) { guessSel = id; screenKey = null; renderScreen(); };
    var gs = $('gscene');
    if (gs) {
      gs.addEventListener('click', function (e) { var g = e.target.closest('.scene-item'); if (g) choose(g.dataset.item); });
      if (guessSel) { var g = document.getElementById('item-' + guessSel); if (g) g.classList.add('sel'); }
    }
    var th = document.querySelectorAll('.thumb');
    for (var i = 0; i < th.length; i++) th[i].onclick = function () { choose(this.dataset.item); };
    var c = $('confirm');
    if (c) c.onclick = function () { c.disabled = true; ctx.act('guess', { itemId: guessSel }); };
  }


  function render(P, root, c) {
    S = Object.assign({}, P, P.game);
    S.me = Object.assign({}, P.me, P.game.me, { isHost: P.me.isHost });
    if (el !== root) { el = root; screenKey = null; }
    ctx = c;
    if (lang !== S.settings.lang) { lang = S.settings.lang; screenKey = null; }
    renderScreen();
  }

  /** Кнопки хоста, специфичные для Чужого (общие — пауза, выгнать, меню — рисует оболочка). */
  function hostButtons(P) {
    var g = P.game || {}, r = g.round, ph = g.phase;
    if (ph === 'lobby' || !r) return [
      { label: '▶ ' + t('host.startRound'), action: 'alien:next' },
      { label: '🏁 ' + t('host.finishMatch'), action: 'alien:finish', cls: 'sec' }
    ];
    if (ph === 'roundEnd') return [
      { label: '▶ ' + t('host.next'), action: 'alien:next' },
      { label: '🏁 ' + t('host.finishMatch'), action: 'alien:finish', cls: 'sec' }
    ];
    return [{ label: r.plus30Used ? t('host.plus30used') : t('host.plus30'), action: 'alien:plus30', cls: 'sec', disabled: r.plus30Used }];
  }

  function unmount() { screenKey = null; guessSel = null; S = null; el = null; lang = null; }

  window.GAMES = window.GAMES || {};
  (window.GAMES.alien = window.GAMES.alien || {}).play = { render: render, unmount: unmount, hostButtons: hostButtons,
    hideReactions: function (p) { var g = p.game || {}; return g.phase === 'look' || (g.priv && g.priv.guessing); } };
})();

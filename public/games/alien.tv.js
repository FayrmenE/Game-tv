/* «Чужой» — экран ТВ (модуль игры для оболочки public/js/tv.js) */
(function () {
  'use strict';
  var t = U.t, esc = U.esc;
  var S = null;
  var mode = null;          // 'lobby' | 'game:<sceneId>'
  var overlayKey = null;    // чтобы не перезапускать анимацию раскрытия
  var timers = [];          // таймауты анимации
  var seenWords = {};       // для анимации появления слова
  var lang = null;
  var prevBars = {};

  var $ = function (id) { return document.getElementById(id); };

  function clearAnim() { timers.forEach(clearTimeout); timers = []; }
  function later(ms, fn) { timers.push(setTimeout(fn, ms)); }

  function render(P) {
    // Состояние платформы + состояние игры (игра переопределяет phase, players и т.д.)
    S = Object.assign({}, P, P.game);
    if (!S.phase) return;
    if (lang !== S.settings.lang) { lang = S.settings.lang; mode = null; overlayKey = null; }
    renderHeader();
    if (S.phase === 'lobby' || !S.round) renderLobby();
    else renderGame();
    renderStrip();
    // На раскрытии и итогах полоса игроков не нужна — отдаём всю высоту оверлею
    $('strip').classList.toggle('hidden', S.phase === 'reveal' || S.phase === 'roundEnd');
  }

  function renderHeader() {
    var r = S.round, ph = S.phase, title = t('phase.' + ph), sub = '';
    if (ph === 'look') sub = t('phase.look.sub');
    else if (ph === 'words' && r.turn) { title = t('phase.words', { c: r.turn.c + 1 }); sub = t('phase.words.sub', { name: U.nameOf(S, r.turn.id) }); }
    else if (ph === 'discuss') sub = r.accelerated ? t('phase.discuss.fast') : t('phase.discuss.sub');
    else if (ph === 'lastword') sub = t('phase.lastword.sub', { name: U.nameOf(S, r.speakerId) }) + ' · ❄ ' + t('frozen');
    else if (ph === 'revote') sub = t('phase.revote.sub');
    else if (ph === 'runoff') sub = t('phase.runoff.sub');
    else if (ph === 'lastchance') sub = t('phase.lastchance.sub', { name: U.nameOf(S, r.alienId) });
    if (ph !== 'lobby' && S.roundNo) title = t('tv.round', { n: S.roundNo }) + ' · ' + title;
    if (ph !== 'lobby' && r) {
      var sc = U.scene(r.sceneId);
      if (sc) sub = (sub ? sub + ' · ' : '') + t(sc.nameKey);
    }
    $('phaseTitle').textContent = title;
    $('phaseSub').textContent = sub;
  }

  /* ------------------------------ лобби ------------------------------ */
  function renderLobby() {
    mode = 'lobby';
    overlayKey = null;
    clearAnim();
    var host = U.playerById(S, S.hostId);
    var notice = S.notice ? '<div class="notice">' + esc(t(S.notice.key, { reason: t(S.notice.reasonKey) })) + '</div>' : '';
    $('main').innerHTML = '<div class="center-msg">' + notice +
      '<h1>👽 ' + esc(t('app.title')) + '</h1>' +
      '<div class="lobby-note">' + esc(host ? t('tv.hostStarts', { name: host.name }) : t('tv.noPlayers')) + '</div></div>';
  }

  /* ------------------------------ игра ------------------------------ */
  function renderGame() {
    var r = S.round, sc = U.scene(r.sceneId);
    if (!sc) return;
    var want = 'game:' + r.sceneId + ':' + S.roundNo;
    if (mode !== want) {
      mode = want;
      overlayKey = null;
      seenWords = {};
      $('main').innerHTML = '<div class="scene-wrap"><div class="scene-frame" id="frame">' + ART.sceneSvg(sc) + '</div></div>' +
        '<div id="overlay" class="overlay hidden"></div><div id="pausedBadge" class="paused-badge hidden"></div>';
    }
    $('pausedBadge').textContent = '⏸ ' + t('tv.paused');
    $('pausedBadge').classList.toggle('hidden', !S.paused);
    if (S.phase === 'reveal') showReveal();
    else if (S.phase === 'roundEnd') showRoundEnd();
    else if (S.phase === 'lastchance') { overlayKey = 'lastchance'; clearAnim(); $('overlay').classList.add('hidden'); highlight({}); }
    else { overlayKey = null; $('overlay').classList.add('hidden'); highlight({}); }
  }

  function highlight(o) {
    var frame = $('frame');
    if (!frame) return;
    var items = frame.querySelectorAll('.scene-item');
    for (var i = 0; i < items.length; i++) items[i].classList.remove('hl', 'hl-alien', 'guess');
    var any = false;
    function add(id, cls) { var e = id && document.getElementById('item-' + id); if (e) { e.classList.add(cls); any = true; } }
    add(o.a, 'hl'); add(o.b, 'hl-alien');
    if (o.guess && o.guess !== o.a) add(o.guess, 'guess');
    frame.classList.toggle('dim', any);
  }

  function itemCard(id, cls, label) {
    if (!id) return '<div class="ritem mystery ' + cls + '"><div class="lbl">' + esc(label) + '</div><div class="q">?</div></div>';
    return '<div class="ritem ' + cls + '"><div class="lbl">' + esc(label) + '</div>' + ART.itemSvg(id) +
      '<div class="nm">№' + U.itemNum(S.round.sceneId, id) + ' · ' + esc(t('item.' + id)) + '</div></div>';
  }

  function voteCardsHtml(votes) {
    return '<div class="vote-cards">' + votes.map(function (v, i) {
      var a = U.playerById(S, v.voter) || { name: '?', color: '#888' }, b = U.playerById(S, v.target) || { name: '?', color: '#888' };
      return '<div class="vcard" id="vc' + i + '"><div class="back">?</div><div class="front">' +
        '<div class="row">' + U.avatar(a) + '<span>' + esc(a.name) + '</span></div>' +
        '<div class="arrow">↓</div>' +
        '<div class="row">' + U.avatar(b) + '<span>' + esc(b.name) + '</span></div></div></div>';
    }).join('') + '</div>';
  }

  function showReveal() {
    var r = S.round, key = 'reveal:' + S.roundNo;
    if (overlayKey === key) return;
    overlayKey = key;
    clearAnim();
    highlight({});
    var ov = $('overlay');
    ov.className = 'overlay';
    var accusedName = r.accused ? U.nameOf(S, r.accused) : null;
    ov.innerHTML = voteCardsHtml(r.revealVotes) +
      '<div class="reveal-line" id="rl1">' + esc(accusedName ? t('reveal.accused', { name: accusedName }) : t('reveal.nobody')) + '</div>' +
      '<div class="reveal-line alien" id="rl2">👽 ' + esc(t('reveal.alienWas', { name: U.nameOf(S, r.alienId) })) + '</div>' +
      '<div class="reveal-items" id="ri">' +
      itemCard(r.itemA, 'civil', t('reveal.itemCivil')) + itemCard(r.itemB, 'alien', t('reveal.itemAlien')) + '</div>';
    var step = 1200;
    SFX.play('drum');
    r.revealVotes.forEach(function (v, i) { later(400 + i * step, function () { var c = $('vc' + i); if (c) c.classList.add('flip'); }); });
    var tEnd = 400 + r.revealVotes.length * step;
    later(tEnd, function () { var e = $('rl1'); if (e) e.classList.add('show'); });
    later(tEnd + 1800, function () { var e = $('rl2'); if (e) e.classList.add('show'); SFX.play(r.caught ? 'win' : 'err'); });
    later(tEnd + 3000, function () {
      var e = $('ri'); if (e) e.classList.add('show');
      if (r.itemA) highlight({ a: r.itemA, b: r.itemB });
    });
  }

  function showRoundEnd() {
    var r = S.round, key = 'end:' + S.roundNo;
    highlight({ a: r.itemA, b: r.itemB, guess: r.guess });
    if (overlayKey === key) return;
    overlayKey = key;
    clearAnim();
    var ov = $('overlay');
    ov.className = 'overlay end';
    ov.style.background = '';
    var good = r.outcome === 'civilians_win';
    var guessLine = '';
    if (r.caught) guessLine = '<div class="reveal-line show" style="font-size:1.3em">' +
      esc(r.guess ? t('reveal.guessed', { item: '№' + U.itemNum(r.sceneId, r.guess) + ' ' + t('item.' + r.guess) }) : t('reveal.noGuess')) + '</div>';
    var players = S.players.slice().sort(function (a, b) { return b.score - a.score; });
    ov.innerHTML =
      '<div class="outcome' + (good ? '' : ' bad') + '">' + esc(t('outcome.' + r.outcome)) + '</div>' +
      '<div class="reveal-line alien show" style="font-size:2em">👽 ' + esc(t('reveal.alienWas', { name: U.nameOf(S, r.alienId) })) + '</div>' +
      guessLine +
      '<div class="reveal-items show">' + itemCard(r.itemA, 'civil', t('reveal.itemCivil')) + itemCard(r.itemB, 'alien', t('reveal.itemAlien')) + '</div>' +
      '<div class="scoreboard">' + players.map(function (p) {
        var d = r.deltas[p.id];
        return '<div class="sc">' + U.avatar(p) + esc(p.name) + ' · ' + p.score + (d ? ' <span class="delta">' + esc(t('outcome.points', { n: d })) + '</span>' : '') + '</div>';
      }).join('') + '</div>';
    // Через несколько секунд убираем затемнение, чтобы было видно подсвеченные предметы на сцене
    later(9000, function () { ov.style.background = 'rgba(20,18,44,.55)'; });
  }

  /* ------------------------------ полоса игроков ------------------------------ */
  function renderStrip() {
    var strip = $('strip');
    if (S.phase === 'lobby' || !S.round) { strip.innerHTML = ''; return; }
    var r = S.round, ph = S.phase;
    var ids = r.order.filter(function (id) { return U.playerById(S, id); });
    S.players.forEach(function (p) { if (ids.indexOf(p.id) < 0) ids.push(p.id); });
    var showBars = ['discuss', 'lastword', 'revote', 'runoff'].indexOf(ph) >= 0;
    var maxV = Math.max(1, r.participants.length - 1);
    strip.innerHTML = ids.map(function (id) {
      var p = U.playerById(S, id), inR = r.participants.indexOf(id) >= 0;
      var cls = ['pcol'];
      if (!inR) cls.push('out');
      if (r.turn && r.turn.id === id) cls.push('turn');
      if (r.speakerId === id) cls.push('speaker');
      if (r.leaders && r.leaders.indexOf(id) >= 0) cls.push('leader');
      if (ph === 'runoff' && r.candidates && r.candidates.indexOf(id) < 0) cls.push('out');
      var cnt = r.voteCounts[id] || 0;
      var h = 100 * cnt / maxV;
      var bar = showBars ? '<div class="bar' + (cnt ? '' : ' zero') + '" data-id="' + id + '" data-h="' + h + '" style="height:' + (prevBars[id] || 0) + '%">' + (cnt ? '<span>' + cnt + '</span>' : '') + '</div>' : '';
      var words = (r.words[id] || [null, null]).map(function (w, c) {
        var k = id + ':' + c;
        if (typeof w === 'string') {
          var fresh = !seenWords[k]; seenWords[k] = true;
          return '<div class="word' + (fresh ? ' fresh' : '') + '">' + esc(w) + '</div>';
        }
        if (w === false) return '<div class="word miss">—</div>';
        if (r.turn && r.turn.id === id && r.turn.c === c) return '<div class="word typing">…</div>';
        return '<div class="word empty"></div>';
      }).join('');
      var check = ph === 'look' && p.looked ? '<div class="check">✓</div>' : '';
      // Место под столбики голосов резервируем только во время голосования
      return '<div class="' + cls.join(' ') + '">' + (showBars ? '<div class="bar-area">' + bar + '</div>' : '') + check + U.avatar(p) +
        '<div class="pname">' + esc(p.name) + '</div><div class="score">★ ' + p.score + '</div>' +
        (inR ? '<div class="words">' + words + '</div>' : '') + '</div>';
    }).join('');
    // Плавный рост столбиков: стартуем с прошлой высоты и анимируем к новой
    var bars = strip.querySelectorAll('.bar');
    requestAnimationFrame(function () {
      for (var i = 0; i < bars.length; i++) { bars[i].style.height = bars[i].dataset.h + '%'; prevBars[bars[i].dataset.id] = bars[i].dataset.h; }
    });
    if (!showBars) prevBars = {};
  }
  function unmount() { clearAnim(); mode = null; overlayKey = null; prevBars = {}; seenWords = {}; S = null; lang = null; }

  window.GAMES = window.GAMES || {};
  (window.GAMES.alien = window.GAMES.alien || {}).tv = { render: render, unmount: unmount };
})();

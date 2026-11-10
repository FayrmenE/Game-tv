/* «Крокодил» — экран телефона (оба режима) */
(function () {
  'use strict';
  var t = U.t, esc = U.esc;
  var $ = function (id) { return document.getElementById(id); };
  var P = null, G = null, el = null, ctx = null, key = null;
  var pad = null, padKey = null, tool = { c: 0, w: 0, e: false }, lineDone = false;
  var lockTimer = null, fb = null, fbTimer = null, draft = '';

  function nm(id) { return U.nameOf(P, id); }
  function msg(emoji, title, sub, cls) {
    return '<div class="card big-msg ' + (cls || '') + '"><div class="emoji">' + emoji + '</div><h2>' + esc(title) + '</h2>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>';
  }

  function render(p, root, c) {
    P = p; G = p.game; ctx = c;
    if (el !== root) { el = root; key = null; }
    if (G.spectator) { destroyPad(); return set('spec', msg('🐊', t('play.spectator'))); }
    var drawing = G.isArtist && G.word && (G.phase === 'draw' || (G.mode === 'duel' && G.phase === 'claimed'));
    if (drawing) return renderArtist();
    destroyPad();
    if (G.mode === 'solo') renderSoloOther(); else renderDuelOther();
  }

  function set(k, html, after) {
    if (k === key) return;
    key = k;
    el.innerHTML = html;
    if (after) after();
  }

  /* ------------------------------ художник: холст ------------------------------ */
  function renderArtist() {
    var cv = G.mode === 'solo' ? 'main' : (G.artists.a === P.me.id ? 'a' : 'b');
    var pk = G.turnNo + ':' + cv + ':' + G.mod + ':' + i18n.getLang();
    if (padKey !== pk || !pad) {
      destroyPad();
      padKey = pk;
      key = 'artist';
      lineDone = false;
      tool = { c: 0, w: 0, e: false };
      var mod = G.mod;
      var colors = mod === 'nocolor' ? '' : CANVAS.COLORS.map(function (col, i) {
        return '<button class="cr-col' + (i === 0 ? ' sel' : '') + '" data-c="' + i + '" style="background:' + col + '"></button>';
      }).join('');
      el.innerHTML = '<div class="fill-screen cr-phone">' +
        '<div class="cr-pword">' + esc(t('croc.yourWord')) + ' <b>' + esc(G.word) + '</b>' +
        (mod ? '<span class="cr-pmod">⚡ ' + esc(t('croc.mod.' + mod)) + '</span>' : '') + '</div>' +
        '<div class="cr-pad-wrap" id="padWrap"><div class="cr-pad-box" id="padBox"><canvas id="pad"></canvas>' +
        (mod === 'mini' ? '<div class="cr-minibox"></div>' : '') +
        '<div class="cr-pad-note' + (mod === 'blind' ? '' : ' hidden') + '" id="padNote">🙈 ' + esc(t('croc.blindHint')) + '</div></div></div>' +
        '<div class="cr-tools">' + colors +
        '<button class="cr-tool sel" data-w="0">●</button><button class="cr-tool" data-w="1">⬤</button>' +
        '<button class="cr-tool" data-e="1">🧽</button>' +
        (mod === 'oneline' ? '' : '<button class="cr-tool" id="tUndo">↶</button><button class="cr-tool" id="tClear">🗑</button>') + '</div>' +
        (G.mode === 'duel' ? '<button class="cr-got" id="gotIt">' + esc(t('croc.gotIt')) + '</button>' : '') + '</div>';
      fitPad();
      pad = new CANVAS.Pad($('pad'), {
        send: function (ops) { ctx.act('draw', { ops: ops }); },
        tool: function () { return { c: G.mod === 'nocolor' ? 0 : tool.c, w: tool.w, e: tool.e }; },
        mini: mod === 'mini', oneline: mod === 'oneline',
        onLine: function () { lineDone = true; pad.disabled = true; var n = $('padNote'); n.textContent = '✋ ' + t('croc.onelineDone'); n.classList.remove('hidden'); }
      });
      if (mod === 'blind') pad.board.setHidden(true);
      el.querySelectorAll('[data-c]').forEach(function (b) {
        b.onclick = function () { tool.c = +b.dataset.c; tool.e = false; sel(); };
      });
      el.querySelectorAll('[data-w]').forEach(function (b) { b.onclick = function () { tool.w = +b.dataset.w; tool.e = false; sel(); }; });
      el.querySelector('[data-e]').onclick = function () { tool.e = !tool.e; sel(); };
      if ($('tUndo')) $('tUndo').onclick = function () { pad.undo(); };
      if ($('tClear')) $('tClear').onclick = function () { pad.clear(); };
      if ($('gotIt')) $('gotIt').onclick = function () { ctx.act('claim'); SFX.play('ok'); };
      window.addEventListener('resize', fitPad);
    }
    // Дуэль: состояние кнопки «Угадали!»
    var got = $('gotIt');
    if (got) {
      var claimed = G.phase === 'claimed';
      got.disabled = claimed || G.lockLeft > 0;
      got.textContent = claimed ? t('croc.claimed', { team: t('croc.team.' + G.claimTeam) }) : t('croc.gotIt');
      clearInterval(lockTimer);
      if (G.lockLeft > 0 && !claimed) {
        var until = Date.now() + G.lockLeft;
        var tick = function () {
          var left = Math.ceil((until - Date.now()) / 1000);
          if (left <= 0) { clearInterval(lockTimer); got.disabled = false; got.textContent = t('croc.gotIt'); return; }
          got.textContent = t('croc.lockedFor', { n: left });
        };
        tick();
        lockTimer = setInterval(tick, 250);
      }
      pad.disabled = claimed || lineDone;
    }
  }

  function sel() {
    el.querySelectorAll('[data-c]').forEach(function (b) { b.classList.toggle('sel', !tool.e && +b.dataset.c === tool.c); });
    el.querySelectorAll('[data-w]').forEach(function (b) { b.classList.toggle('sel', !tool.e && +b.dataset.w === tool.w); });
    var e = el.querySelector('[data-e]'); if (e) e.classList.toggle('sel', tool.e);
  }

  function fitPad() {
    var wrap = $('padWrap'), box = $('padBox');
    if (!wrap || !box) return;
    var s = Math.floor(Math.min(wrap.clientWidth, wrap.clientHeight));
    box.style.width = box.style.height = s + 'px';
    if (pad) pad.board.resize();
  }

  function destroyPad() {
    if (pad) { pad.destroy(); pad = null; window.removeEventListener('resize', fitPad); }
    padKey = null;
    clearInterval(lockTimer);
  }

  /* ------------------------------ Личный: остальные ------------------------------ */
  function renderSoloOther() {
    var ph = G.phase;
    if (ph === 'choose' && G.options) {
      return set('choose:' + G.turnNo + i18n.getLang(), '<div class="fill-screen"><div class="card"><h2>🎨 ' + esc(t('croc.choose')) + '</h2>' +
        (G.mod ? '<p>⚡ ' + esc(t('croc.mod.' + G.mod)) + ' — ' + esc(t('croc.mod.' + G.mod + '.d')) + '</p>' : '') + '</div>' +
        ['easy', 'medium', 'hard'].map(function (lv) {
          return '<button class="cr-choice lv-' + lv + '" data-lv="' + lv + '"><b>' + esc(G.options[lv]) + '</b><small>' + esc(t('croc.level.' + lv)) + '</small></button>';
        }).join('') + '</div>', function () {
        el.querySelectorAll('[data-lv]').forEach(function (b) { b.onclick = function () { ctx.act('choose', { level: b.dataset.lv }); }; });
      });
    }
    if (ph === 'choose') return set('wchoose:' + G.turnNo + i18n.getLang(), msg('🤔', t('croc.waitArtist', { name: nm(G.artist) }), t('play.watch')));
    if (ph === 'draw') {
      if (G.guessed) return set('ok:' + G.turnNo + G.almost + i18n.getLang(), msg('🎉', t('croc.youGuessed') + (G.almost ? ' (' + t('croc.almost') + ')' : ''), t('croc.youGuessedSub'), 'good'));
      var mask = G.mask.map(function (ch) { return ch === ' ' ? '<span class="sp"></span>' : '<span>' + esc(ch === '_' ? '' : ch) + '</span>'; }).join('');
      var k = 'guess:' + G.turnNo + ':' + G.mask.join('') + i18n.getLang();
      var inp = $('gIn');
      if (inp) draft = inp.value;
      var hadFocus = inp && document.activeElement === inp;
      return set(k, '<div class="fill-screen"><div class="card"><h2>✏️ ' + esc(t('croc.draws', { name: nm(G.artist) })) + '</h2>' +
        '<div class="cr-pmask">' + mask + '</div><p>' + esc(t('croc.guessHint')) + '</p></div>' +
        '<div class="card"><input class="t" id="gIn" maxlength="40" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="' + esc(t('croc.guessPh')) + '">' +
        '<button class="btn" id="gGo">' + esc(t('croc.send')) + '</button><div class="cr-fb" id="gFb"></div></div></div>', function () {
        var i = $('gIn');
        i.value = draft;
        var go = function () { var v = i.value.trim(); if (!v) return; ctx.act('guess', { text: v }); i.value = ''; draft = ''; i.focus(); };
        $('gGo').onclick = go;
        i.onkeydown = function (e) { if (e.key === 'Enter') go(); };
        if (hadFocus || !draft) i.focus();
        showFb();
      });
    }
    if (ph === 'reveal') return set('rev:' + G.turnNo + i18n.getLang(), msg(G.myPoints ? '🎉' : '🖼️', t('croc.wordWas', { word: G.word }),
      G.myPoints ? '+' + G.myPoints : t('play.watch')));
    if (ph === 'vote') {
      var v = G.vote;
      return set('vote:' + v.mine + i18n.getLang(), '<div class="card"><h2>😂 ' + esc(t('croc.vote')) + '</h2><p>' + esc(t('croc.voteHint')) + '</p></div>' +
        '<div class="cr-vlist">' + v.cands.map(function (c) {
          var mine = c.id === P.me.id;
          return '<button class="vote-btn' + (v.mine === c.i ? ' sel' : '') + '" data-i="' + c.i + '"' + (mine ? ' disabled' : '') + '><span>«' + esc(c.text) + '»' +
            '<small>' + esc(mine ? t('croc.voteYours') : nm(c.id)) + '</small></span></button>';
        }).join('') + '</div>', function () {
        el.querySelectorAll('[data-i]').forEach(function (b) { b.onclick = function () { ctx.act('vote', { i: +b.dataset.i }); }; });
      });
    }
    set('x:' + ph, msg('📺', t('play.watch')));
  }

  function showFb() {
    var f = $('gFb');
    if (!f) return;
    f.className = 'cr-fb' + (fb ? ' ' + fb : '');
    f.textContent = fb === 'bad' ? '✗' : '';
  }

  /* ------------------------------ Дуэль: остальные ------------------------------ */
  function renderDuelOther() {
    var ph = G.phase, team = G.team, tn = team ? t('croc.team.' + team) : '';
    if (ph === 'teams') return set('teams:' + team + i18n.getLang(), msg(team === 'a' ? '🔴' : '🔵', t('croc.yourTeam', { team: tn }), t('croc.teamsWait'), 'team-' + team));
    if (ph === 'draw') return set('shout:' + G.turnNo + team + i18n.getLang(), '<div class="fill-screen"><div class="cr-shout team-' + team + '">📣<b>' + esc(t('croc.shout')) + '</b><small>' +
      esc(t('croc.yourTeam', { team: tn })) + '</small></div></div>');
    if (ph === 'claimed') {
      var isHost = P.me.isHost;
      return set('claimed:' + G.turnNo + isHost + G.claimTeam + i18n.getLang(), msg('🎯', t('croc.claimed', { team: t('croc.team.' + G.claimTeam) }), t('croc.wordWas', { word: G.word })) +
        (isHost ? '<button class="btn danger cr-undo" id="cUndo">↶ ' + esc(t('croc.undoClaim')) + '</button>' : ''), function () {
        if ($('cUndo')) $('cUndo').onclick = function () { ctx.host('croc:undo'); };
      });
    }
    if (ph === 'reveal') return set('rev:' + G.turnNo + i18n.getLang(), msg(G.winner ? (G.winner === team ? '🎉' : '😤') : '⌛',
      G.winner ? t('croc.teamWins', { team: t('croc.team.' + G.winner), n: '' }).replace(/\s*\+\s*$/, '') : t('croc.timeout'), t('croc.wordWas', { word: G.word })));
    set('x:' + ph, msg('📺', t('play.watch')));
  }

  /* ------------------------------ события и хост ------------------------------ */
  function onEvent(ev, d) {
    if (ev === 'full' && pad) pad.board.reset(d.strokes);
    if (ev === 'guess') {
      fb = d.ok ? null : 'bad';
      if (!d.ok) { SFX.play('err'); try { navigator.vibrate && navigator.vibrate(80); } catch (e) { /* ignore */ } }
      showFb();
      clearTimeout(fbTimer);
      fbTimer = setTimeout(function () { fb = null; showFb(); }, 900);
    }
  }

  function hostButtons(p) {
    var g = p.game || {};
    if (g.mode !== 'duel') return [];
    if (g.phase === 'teams') {
      var out = [{ label: '▶ ' + t('croc.startDuel'), action: 'croc:start' }];
      ['a', 'b'].forEach(function (k) {
        (g.teams[k] || []).forEach(function (id) {
          out.push({ label: (k === 'a' ? '🔴' : '🔵') + ' ' + U.nameOf(p, id) + ' ⇄', action: 'croc:move', data: { playerId: id }, cls: 'sec' });
        });
      });
      return out;
    }
    if (g.phase === 'claimed') return [{ label: '↶ ' + t('croc.undoClaim'), action: 'croc:undo', cls: 'danger' }];
    return [];
  }

  function unmount() { destroyPad(); key = null; P = G = null; el = null; draft = ''; }

  window.GAMES = window.GAMES || {};
  (window.GAMES.croc = window.GAMES.croc || {}).play = { render: render, unmount: unmount, onEvent: onEvent, hostButtons: hostButtons };
})();

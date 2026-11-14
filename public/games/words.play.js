/* «Объясни!» и «Шляпа» — экран телефона */
(function () {
  'use strict';
  var t = U.t, esc = U.esc;
  var $ = function (id) { return document.getElementById(id); };
  var P = null, G = null, el = null, ctx = null, key = null, lastPk = null;
  var pad = null, padKey = null, tool = { c: 0, w: 0, e: false };
  var MODE_ICON = { explain: '🗣️', oneword: '☝️', gestures: '🤸', draw: '🎨' };

  function pl(id) { return U.playerById(P, id) || { name: '?', color: '#888' }; }
  function teamName(i) { return t('words.team.' + i); }
  function tcol(i) { return (G.colors || [])[i] || '#888'; }
  function buzz(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* ignore */ } }
  function msg(emoji, title, sub) {
    return '<div class="card big-msg"><div class="emoji">' + emoji + '</div><h2>' + esc(title) + '</h2>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>';
  }
  function set(k, html, after) { if (k === key) return false; key = k; el.innerHTML = html; if (after) after(); return true; }
  function head() {
    if (G.myTeam < 0) return '';
    return '<div class="wd-me" style="--c:' + tcol(G.myTeam) + '"><b>' + esc(teamName(G.myTeam)) + '</b>' +
      (G.scores && G.scores.length ? '<span>' + (G.scores[G.myTeam] || 0) + '</span>' : '') + '</div>';
  }

  function render(p, root, c) {
    P = p; G = p.game; ctx = c;
    if (el !== root) { el = root; key = null; }
    var ph = G.phase, lang = i18n.getLang(), me = G.me, isExp = G.explainer === me;
    var pk = ph + ':' + G.round + ':' + (G.explainer || '');
    if (pk !== lastPk) { if (lastPk && isExp && (ph === 'ready' || ph === 'turn')) buzz([60, 40, 60]); lastPk = pk; }
    if (!(ph === 'turn' && isExp && G.roundMode === 'draw')) destroyPad();
    if (G.spectator) return set('spec' + lang, msg('👀', t('play.spectator'), t('play.watch')));
    var base = pk + ':' + lang + ':' + (G.scores || []).join(',') + ':';

    if (ph === 'teams') return teamsView(lang);
    if (ph === 'round') {
      return set(base, head() + msg(MODE_ICON[G.roundMode], t('words.ph.round', { n: G.round, m: G.rounds }) + ': ' + t('words.mode.' + G.roundMode), t('words.mode.' + G.roundMode + '.d')));
    }
    if (ph === 'final') {
      var order = G.scores.map(function (s, i) { return i; }).sort(function (a, b) { return G.scores[b] - G.scores[a]; });
      var place = order.indexOf(G.myTeam) + 1;
      return set(base, head() + msg(place === 1 ? '🏆' : '👏', place === 1 ? t('words.p.won') : t('words.p.place', { n: place }), t('play.watch')));
    }
    var mine = G.team === G.myTeam;
    if (ph === 'ready') {
      if (isExp) {
        return set(base + 'go', head() + '<div class="card big-msg wd-go"><div class="emoji">' + MODE_ICON[G.roundMode] + '</div><h2>' + esc(t('words.p.yourTurn')) + '</h2><p>' +
          esc(t('words.p.yourTurnSub', { team: teamName(G.team), sec: G.turnSec })) + '</p><p class="wd-rule">' + esc(t('words.tv.hint.' + G.roundMode)) + '</p>' +
          '<button class="btn" id="wdGo">▶ ' + esc(t('words.p.go')) + '</button></div>', function () {
          $('wdGo').onclick = function () { this.disabled = true; ctx.act('go'); };
        });
      }
      return set(base + (mine ? 'm' : 'o'), head() + (mine ? msg('🙌', t('words.p.guessNext', { name: pl(G.explainer).name }), t('words.p.guessNextSub'))
        : msg('🕵️', t('words.p.foeNext', { team: teamName(G.team) }), t('words.p.controlSub'))));
    }
    if (ph === 'turn') {
      if (isExp) return G.roundMode === 'draw' ? drawView(lang) : explainView(base);
      if (mine) return set(base + 'g' + (G.guessed || []).length, head() + msg('📣', t('words.p.shout'), t('words.p.shoutSub', { name: pl(G.explainer).name, n: (G.guessed || []).length })));
      return set(base + 'c' + G.word, head() + '<div class="card wd-ctrl"><p>🕵️ ' + esc(t('words.p.control')) + '</p><div class="wd-cword">' + esc(G.word || '') + '</div><p class="hint">' +
        esc(t('words.p.controlSub')) + '</p></div>');
    }
    if (ph === 'last') {
      if (isExp) {
        return set(base + 'last', head() + '<div class="card wd-lastbox"><h2>🔔 ' + esc(t('words.p.lastQ')) + '</h2><div class="wd-cword">' + esc(G.word || '') + '</div>' +
          G.teams.map(function (ids, i) {
            return ids.length ? '<button class="btn wd-tb" style="--c:' + tcol(i) + '" data-last="' + i + '">' + esc(teamName(i)) + '</button>' : '';
          }).join('') + '<button class="btn sec" data-last="-1">' + esc(t('words.p.nobody')) + '</button></div>', function () {
          el.querySelectorAll('[data-last]').forEach(function (b) {
            b.onclick = function () { el.querySelectorAll('[data-last]').forEach(function (x) { x.disabled = true; }); ctx.act('last', { team: +b.dataset.last }); };
          });
        });
      }
      return set(base + 'lw', head() + msg('🔔', t('words.p.lastAll'), t('words.p.lastAllSub')));
    }
    if (ph === 'review') {
      var rv = G.review || [];
      var list = '<div class="wd-rlist">' + (rv.length ? rv.map(function (r, i) {
        return '<button class="wd-ritem ' + (r.ok ? 'ok' : 'no') + '" data-tg="' + i + '"' + (isExp ? '' : ' disabled') + '>' + (r.ok ? '✓' : '✗') + ' ' + esc(r.word) + '</button>';
      }).join('') : '<p class="hint">' + esc(t('words.tv.none')) + '</p>') + '</div>';
      return set(base + 'rv' + JSON.stringify(rv) + isExp, head() + '<div class="card"><h2>📋 ' + esc(t(isExp ? 'words.p.reviewMe' : 'words.p.review')) + '</h2>' + list +
        (isExp ? '<button class="btn" id="wdDone">✅ ' + esc(t('words.p.done')) + '</button>' : '') + '</div>', function () {
        if (!isExp) return;
        el.querySelectorAll('[data-tg]').forEach(function (b) { b.onclick = function () { ctx.act('toggle', { i: +b.dataset.tg }); }; });
        $('wdDone').onclick = function () { this.disabled = true; ctx.act('done'); };
      });
    }
  }

  function teamsView(lang) {
    var host = P.me && P.me.id === P.hostId;
    var k = 'teams' + lang + JSON.stringify(G.teams) + host;
    var html = '<div class="card"><h2>👥 ' + esc(t('words.ph.teams')) + '</h2>' + (G.myTeam >= 0 ? '<p>' + esc(t('words.p.yourTeam', { team: teamName(G.myTeam) })) + '</p>' : '') +
      G.teams.map(function (ids, i) {
        return '<div class="wd-pteam" style="--c:' + tcol(i) + '"><b>' + esc(teamName(i)) + '</b>' + ids.map(function (id) {
          return host ? '<button class="wd-mv" data-mv="' + id + '">' + U.avatar(pl(id)) + esc(pl(id).name) + ' ⇄</button>' : '<span>' + U.avatar(pl(id)) + esc(pl(id).name) + '</span>';
        }).join('') + '</div>';
      }).join('') + '</div>';
    if (host) {
      html += '<div class="card"><p class="hint">' + esc(t('words.p.hostTeams')) + '</p><div class="wd-nbtn">' + [2, 3, 4].map(function (n) {
        return '<button class="btn sec' + (G.teams.length === n ? ' sel' : '') + '" data-n="' + n + '">' + esc(t('words.p.nTeams', { n: n })) + '</button>';
      }).join('') + '</div><button class="btn" id="wdStart">▶ ' + esc(t('words.p.start')) + '</button></div>';
    } else html += msg('⏳', t('words.p.waitTeams'));
    set(k, html, function () {
      el.querySelectorAll('[data-mv]').forEach(function (b) { b.onclick = function () { ctx.host('words:move', { playerId: b.dataset.mv }); }; });
      el.querySelectorAll('[data-n]').forEach(function (b) { b.onclick = function () { ctx.host('words:teams', { n: +b.dataset.n }); }; });
      var s = $('wdStart'); if (s) s.onclick = function () { ctx.host('words:start'); };
    });
  }

  function explainView(base) {
    var k = base + 'x' + G.word + ':' + (G.guessed || []).length + ':' + G.skipped;
    var fresh = set(k, head() + '<div class="wd-xp"><div class="wd-mode">' + MODE_ICON[G.roundMode] + ' ' + esc(t('words.tv.hint.' + G.roundMode)) + '</div>' +
      '<div class="wd-word" id="wdWord" style="font-size:' + wordSize(G.word) + 'px">' + esc(G.word || '') + '</div><div class="wd-cnt">' + esc(t('words.tv.count', { n: (G.guessed || []).length })) +
      (G.poolLeft != null ? ' · ' + esc(t('words.inHat', { n: G.poolLeft })) : '') + '</div>' +
      '<div class="wd-btns"><button class="btn danger" id="wdSkip">✗ ' + esc(t('words.p.skip')) + '</button><button class="btn" id="wdOk">✓ ' + esc(t('words.p.ok')) + '</button></div></div>', bind);
    if (fresh) SFX.play('pop');
  }
  /** Размер шрифта по самому длинному слову фразы — чтобы слово не рвалось посередине */
  function wordSize(w) {
    var longest = String(w || '').split(/\s+/).reduce(function (m, x) { return Math.max(m, x.length); }, 1);
    return Math.max(22, Math.min(44, Math.floor(440 / Math.max(longest, 8))));
  }
  function bind() {
    var ok = $('wdOk'), sk = $('wdSkip');
    // защита от двойного нажатия: кнопки оживают, когда пришло новое слово
    if (ok) ok.onclick = function () { ok.disabled = sk.disabled = true; ctx.act('ok'); buzz(20); };
    if (sk) sk.onclick = function () { ok.disabled = sk.disabled = true; ctx.act('skip'); };
  }

  function drawView(lang) {
    var pk = G.round + ':' + G.explainer + ':' + lang;
    if (padKey !== pk || !pad) {
      destroyPad(); padKey = pk; key = 'draw';
      tool = { c: 0, w: 0, e: false };
      el.innerHTML = '<div class="fill-screen cr-phone"><div class="cr-pword">🎨 <b id="wdDw"></b></div>' +
        '<div class="cr-pad-wrap" id="padWrap"><div class="cr-pad-box" id="padBox"><canvas id="pad"></canvas></div></div>' +
        '<div class="cr-tools">' + CANVAS.COLORS.map(function (col, i) {
          return '<button class="cr-col' + (i === 0 ? ' sel' : '') + '" data-c="' + i + '" style="background:' + col + '"></button>';
        }).join('') + '<button class="cr-tool" data-e="1">🧽</button><button class="cr-tool" id="tUndo">↶</button><button class="cr-tool" id="tClear">🗑</button></div>' +
        '<div class="wd-btns"><button class="btn danger" id="wdSkip">✗ ' + esc(t('words.p.skip')) + '</button><button class="btn" id="wdOk">✓ ' + esc(t('words.p.ok')) + '</button></div></div>';
      fit();
      pad = new CANVAS.Pad($('pad'), { send: function (ops) { ctx.act('draw', { ops: ops }); }, tool: function () { return tool; } });
      el.querySelectorAll('[data-c]').forEach(function (b) {
        b.onclick = function () { tool = { c: +b.dataset.c, w: 0, e: false }; el.querySelectorAll('[data-c],[data-e]').forEach(function (x) { x.classList.toggle('sel', x === b); }); };
      });
      el.querySelector('[data-e]').onclick = function () { tool = { c: 0, w: 1, e: true }; el.querySelectorAll('[data-c],[data-e]').forEach(function (x) { x.classList.toggle('sel', x.dataset.e === '1'); }); };
      $('tUndo').onclick = function () { pad.undo(); };
      $('tClear').onclick = function () { pad.clear(); };
      window.addEventListener('resize', fit);
    }
    var w = $('wdDw'), n = String((G.guessed || []).length + ':' + G.skipped);
    if (w.textContent !== G.word || w.dataset.n !== n) {
      w.textContent = G.word || '';
      w.dataset.n = n;
      if (pad) pad.board.reset([]);
      var ok = $('wdOk'), sk = $('wdSkip'); ok.disabled = sk.disabled = false; bind();
    }
  }
  function fit() {
    var wrap = $('padWrap'), box = $('padBox'); if (!wrap || !box) return;
    var s = Math.floor(Math.min(wrap.clientWidth, wrap.clientHeight));
    box.style.width = box.style.height = s + 'px';
    if (pad) pad.board.resize();
  }
  function destroyPad() { if (pad) { pad.destroy(); pad = null; window.removeEventListener('resize', fit); } padKey = null; }

  function onEvent(ev, d) { if (ev === 'full' && pad) pad.board.reset(d.strokes || []); }
  function unmount() { destroyPad(); key = null; el = null; lastPk = null; }

  window.GAMES = window.GAMES || {};
  (window.GAMES.words = window.GAMES.words || {}).play = {
    render: render, unmount: unmount, onEvent: onEvent,
    // объясняющему и контролёрам слово не должны закрывать реакции
    hideReactions: function (p) { var g = p.game || {}; return g.phase === 'turn' && g.explainer === g.me; }
  };
})();

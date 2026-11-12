/* «Сундуки» — экран телефона */
(function () {
  'use strict';
  var t = U.t, esc = U.esc;
  var $ = function (id) { return document.getElementById(id); };
  var P = null, G = null, el = null, ctx = null, key = null, lastPhase = null;
  var draft = 0, draftIdx = -1, sentAt = 0;

  function pl(id) { return U.playerById(P, id) || { name: '?', color: '#888' }; }
  function C() { return window.CHESTS; }
  function buzz(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* ignore */ } }
  function msg(emoji, title, sub) {
    return '<div class="card big-msg"><div class="emoji">' + emoji + '</div><h2>' + esc(title) + '</h2>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>';
  }
  function set(k, html, after) { if (k === key) return false; key = k; el.innerHTML = html; if (after) after(); return true; }

  function head() {
    var c = G.coins[G.me] || 0;
    var role = G.role === 'keeper' ? '🗝️ ' + t('chests.role.keeper') : G.role === 'bankrupt' ? '💀 ' + t('chests.role.bankrupt') : '🎲 ' + t('chests.role.bidder');
    return '<div class="ch-me"><span class="ch-coins">🪙 <b>' + c + '</b></span><span class="ch-role ' + G.role + '">' + esc(role) + '</span>' +
      '<span class="ch-cnt">' + esc(t('chests.counterShort', { i: Math.min(G.idx + 1, G.total), n: G.total })) + '</span></div>';
  }

  function render(p, root, c) {
    P = p; G = p.game; ctx = c;
    if (el !== root) { el = root; key = null; }
    if (G.spectator) return set('spec', msg('👀', t('play.spectator'), t('play.watch')));
    var ph = G.phase, lang = i18n.getLang();
    var pk = G.idx + ':' + ph;
    if (pk !== lastPhase) { if (lastPhase !== null) buzz(ph === 'inspect' && G.role === 'keeper' ? [60, 60, 60] : 40); lastPhase = pk; }
    var base = G.idx + ':' + ph + ':' + lang + ':' + G.role + ':' + (G.coins[G.me] || 0) + ':';

    if (ph === 'final') {
      return set(base + 'f', head() + msg('🏁', t('chests.youEnd', { n: G.coins[G.me] || 0 }), t('play.watch')));
    }
    if (G.role === 'keeper' && G.secret) return keeperView(base);
    if (ph === 'inspect') return set(base, head() + msg('🗝️', t('chests.p.inspectOther', { name: pl(G.keeper).name }), t('chests.p.inspectOtherSub')));
    if (ph === 'discuss') {
      if (G.role === 'bankrupt') return set(base, head() + msg('💀', t('chests.p.bankrupt'), t('chests.p.listen', { name: pl(G.keeper).name })));
      return set(base, head() + msg('👂', t('chests.p.listen', { name: pl(G.keeper).name }), t('chests.p.listenSub')));
    }
    if (ph === 'bid') {
      if (G.myBid == null) return set(base, head() + msg('💀', t('chests.p.bankrupt'), t('chests.p.bankruptSub')));
      return bidView(base);
    }
    if (ph === 'thief' && G.targets) return thiefView(base);
    return resultView(base);
  }

  function keeperView(base) {
    var k = G.secret, ph = G.phase;
    var box = '<div class="card ch-secret ' + C().cardTone(k) + '"><div class="ch-s-emoji">' + C().cardEmoji(k) + '</div><div class="ch-s-label">' + esc(C().cardLabel(k)) + '</div></div>';
    var warn = '<p class="ch-warn">🤫 ' + esc(t('chests.p.lie')) + '</p>';
    var btn = ph === 'inspect' ? '<button class="btn" id="chReady">✅ ' + esc(t('chests.p.ready')) + '</button>' :
      ph === 'discuss' ? '<p class="ch-hint">🗣️ ' + esc(t('chests.p.talk')) + '</p><button class="btn sec" id="chSkip">⏭ ' + esc(t('chests.p.skip')) + '</button>' :
      '<p class="ch-hint">⏳ ' + esc(t('chests.p.waitBids')) + '</p>';
    set(base + 'k' + k, head() + box + warn + btn, function () {
      var r = $('chReady'); if (r) r.onclick = function () { r.disabled = true; ctx.act('ready'); };
      var s = $('chSkip'); if (s) s.onclick = function () { s.disabled = true; ctx.act('skip'); };
    });
  }

  function bidView(base) {
    var have = G.coins[G.me] || 0;
    if (draftIdx !== G.idx) { draftIdx = G.idx; draft = G.myBid || 0; }
    set(base + 'b', head() + '<div class="card ch-bidbox"><h2>🪙 ' + esc(t('chests.p.bidTitle')) + '</h2>' +
      '<div class="ch-big" id="chBig"></div><div class="ch-ok" id="chOk"></div>' +
      '<div class="ch-btns"><button class="btn sec" data-d="-5">−5</button><button class="btn sec" data-d="1">+1</button>' +
      '<button class="btn sec" data-d="5">+5</button><button class="btn sec" data-d="10">+10</button></div>' +
      '<div class="ch-btns two"><button class="btn warn" id="chPass">🙅 ' + esc(t('chests.pass')) + '</button><button class="btn danger" id="chAll">🔥 ' + esc(t('chests.p.allIn')) + '</button></div>' +
      '<p class="ch-hint">' + esc(t('chests.p.bidHint', { n: have })) + '</p></div>', function () {
      var send = function (v) { draft = Math.max(0, Math.min(have, v)); sentAt = Date.now(); ctx.act('bid', { bid: draft }); paint(); SFX.play('click'); };
      el.querySelectorAll('[data-d]').forEach(function (b) { b.onclick = function () { send(draft + Number(b.dataset.d)); }; });
      $('chPass').onclick = function () { send(0); };
      $('chAll').onclick = function () { send(have); };
    });
    // сервер подтвердил — держим черновик, если он отличается от серверного только из-за задержки
    if (Date.now() - sentAt > 1500 && G.myTouched) draft = G.myBid;
    paint();
  }
  function paint() {
    var b = $('chBig'), ok = $('chOk'); if (!b) return;
    b.textContent = draft ? draft : t('chests.pass');
    b.classList.toggle('zero', !draft);
    var accepted = G.myTouched && G.myBid === draft;
    ok.textContent = accepted ? '✓ ' + t('chests.p.accepted', { n: draft || t('chests.pass') }) : G.myTouched ? '…' : t('chests.p.notYet');
    ok.classList.toggle('yes', !!accepted);
  }

  function thiefView(base) {
    set(base + 't', head() + '<div class="card"><h2>🦹 ' + esc(t('chests.p.thief')) + '</h2><p>' + esc(t('chests.p.thiefSub')) + '</p></div><div class="cr-vlist">' +
      G.targets.map(function (id) {
        return '<button class="vote-btn" data-tg="' + id + '">' + U.avatar(pl(id)) + '<span>' + esc(pl(id).name) + '<small>🪙 ' + (G.coins[id] || 0) + '</small></span></button>';
      }).join('') + '</div>', function () {
      el.querySelectorAll('[data-tg]').forEach(function (b) {
        b.onclick = function () { el.querySelectorAll('[data-tg]').forEach(function (x) { x.disabled = true; }); ctx.act('steal', { target: b.dataset.tg }); };
      });
    });
  }

  function resultView(base) {
    var d = (G.delta && G.delta[G.me]) || 0;
    var k = G.card;
    var sub = G.phase === 'thief' ? t('chests.eff.thiefPick', { name: pl(G.thief && G.thief.id).name }) : t('play.watch');
    var title = d > 0 ? t('chests.p.plus', { n: d }) : d < 0 ? t('chests.p.minus', { n: -d }) : t('chests.p.zero');
    set(base + 'r' + d + (G.thief && G.thief.target), head() +
      '<div class="card ch-secret small ' + C().cardTone(k) + '"><div class="ch-s-emoji">' + C().cardEmoji(k) + '</div><div class="ch-s-label">' + esc(C().cardLabel(k)) + '</div></div>' +
      msg(d > 0 ? '🎉' : d < 0 ? '😬' : '😐', title, sub));
  }

  function unmount() { key = null; el = null; lastPhase = null; draftIdx = -1; }
  window.GAMES = window.GAMES || {};
  (window.GAMES.chests = window.GAMES.chests || {}).play = { render: render, unmount: unmount };
})();

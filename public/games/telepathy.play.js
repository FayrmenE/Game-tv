/* «Телепатия» — экран телефона */
(function () {
  'use strict';
  var t = U.t, esc = U.esc;
  var $ = function (id) { return document.getElementById(id); };
  var P = null, G = null, el = null, ctx = null, key = null, draft = '';

  function msg(emoji, title, sub) {
    return '<div class="card big-msg"><div class="emoji">' + emoji + '</div><h2>' + esc(title) + '</h2>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>';
  }
  function set(k, html, after) { if (k === key) return; key = k; el.innerHTML = html; if (after) after(); }

  function render(p, root, c) {
    P = p; G = p.game; ctx = c;
    if (el !== root) { el = root; key = null; }
    var lang = i18n.getLang();
    if (G.spectator) return set('spec', msg('🔮', t('play.spectator')));
    var tr = G.turn || {}, ph = G.phase, sc = U.scene(tr.sceneId);
    if (!sc) return;
    var giver = U.nameOf(P, tr.giver);
    if (ph === 'clue' && G.isGiver) {
      var inp = $('tpIn'); if (inp) draft = inp.value;
      var card = function (id, cls, lbl) {
        return '<div class="tp-card ' + cls + '"><div class="thumb">' + ART.itemSvg(id) + '</div><b>' + esc(lbl) + '</b><span>' + esc(t('item.' + id)) + '</span></div>';
      };
      return set('give:' + G.turnNo + lang, '<div class="card"><h2>🔮 ' + esc(t('tele.youGive')) + '</h2>' +
        '<div class="tp-cards">' + card(tr.targets[0], 'ok', t('tele.target')) + card(tr.targets[1], 'ok', t('tele.target')) + card(tr.trap, 'trap', t('tele.trap')) + '</div>' +
        '<input class="t" id="tpIn" maxlength="20" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="' + esc(t('tele.wordPh')) + '">' +
        '<button class="btn" id="tpGo">' + esc(t('tele.send')) + '</button></div>', function () {
        var i = $('tpIn'); i.value = draft;
        i.addEventListener('input', function () { var v = i.value.replace(/\s+/g, ''); if (v !== i.value) i.value = v; });
        var go = function () { var v = i.value.trim(); if (v) ctx.act('clue', { word: v }); };
        $('tpGo').onclick = go; i.onkeydown = function (e) { if (e.key === 'Enter') go(); };
      });
    }
    if (ph === 'clue') return set('wait:' + G.turnNo + lang, msg('🤔', t('tele.waitGiver', { name: giver }), t('play.watch')));
    if (ph === 'guess' && G.isGiver) return set('gw:' + G.turnNo + lang, msg('🤐', t('tele.giverWait'), tr.clue ? '«' + tr.clue + '»' : ''));
    if (ph === 'guess') {
      var sel = (tr.sel || []).map(function (s) { return s.item; });
      return set('guess:' + G.turnNo + ':' + sel.join(',') + lang, '<div class="card tp-head"><div>' + (tr.clue ? '<small>' + esc(t('tele.guessTv')) + '</small><b>' + esc(tr.clue) + '</b>' : esc(t('tele.noClue'))) + '</div>' +
        '<p>' + esc(t('tele.pickTwo')) + ' · ' + esc(t('tele.picked', { n: sel.length })) + '</p></div>' +
        '<div class="thumbs tp-thumbs">' + sc.items.map(function (i) {
          return '<button class="thumb' + (sel.indexOf(i.id) >= 0 ? ' sel' : '') + '" data-item="' + i.id + '"><b>' + i.num + '</b>' + ART.itemSvg(i.id) + '</button>';
        }).join('') + '</div><button class="btn" id="tpDone"' + (sel.length < 2 ? ' disabled' : '') + '>✅ ' + esc(t('tele.done')) + '</button>', function () {
        el.querySelectorAll('[data-item]').forEach(function (b) { b.onclick = function () { ctx.act('pick', { itemId: b.dataset.item }); }; });
        $('tpDone').onclick = function () { ctx.act('done'); };
      });
    }
    if (ph === 'reveal') return set('rev:' + G.turnNo + lang, msg(tr.trapHit ? '💥' : tr.pts ? '🎉' : '😕',
      tr.trapHit ? t('tele.resTrap') : t('tele.resHits', { n: tr.hits }), t('tele.resPts', { n: tr.pts }) + ' · ' + t('tele.team', { n: G.team, max: G.total * 3 })));
    set('x' + ph, msg('📺', t('play.watch')));
  }

  function unmount() { key = null; P = G = null; el = null; draft = ''; }
  window.GAMES = window.GAMES || {};
  (window.GAMES.telepathy = window.GAMES.telepathy || {}).play = { render: render, unmount: unmount };
})();

/* «Крокодил» — экран ТВ (оба режима) */
(function () {
  'use strict';
  var t = U.t, esc = U.esc;
  var $ = function (id) { return document.getElementById(id); };
  var P = null, G = null, layout = null, boards = {}, pending = {}, lastBanner = null, lastWrongKey = null;
  var feed = [];

  function nm(id) { return U.nameOf(P, id); }
  function pl(id) { return U.playerById(P, id) || { name: '?', color: '#888' }; }

  function board(cv) {
    if (!boards[cv]) {
      var el = $('cv_' + cv);
      if (!el) return null;
      boards[cv] = new CANVAS.Board(el);
      if (pending[cv]) { boards[cv].reset(pending[cv]); delete pending[cv]; }
    }
    return boards[cv];
  }

  function mount(mode) {
    Object.keys(boards).forEach(function (k) { boards[k].destroy(); });
    boards = {};
    layout = mode + ':' + i18n.getLang();
    if (mode === 'solo') {
      $('main').innerHTML = '<div class="cr-solo">' +
        '<div class="cr-left"><div class="cr-board-wrap" id="wrap_main"><canvas id="cv_main"></canvas><div class="cr-minibox"></div></div>' +
        '<div class="cr-mask" id="crMask"></div></div>' +
        '<div class="cr-side" id="crSide"></div>' +
        '<div class="cr-banner hidden" id="crBanner"></div><div class="cr-overlay hidden" id="crOv"></div></div>';
    } else {
      $('main').innerHTML = '<div class="cr-duel"><div class="cr-race" id="crRace"></div><div class="cr-boards">' +
        ['a', 'b'].map(function (k) {
          return '<div class="cr-half team-' + k + '"><div class="cr-artist" id="crArt_' + k + '"></div>' +
            '<div class="cr-board-wrap" id="wrap_' + k + '"><canvas id="cv_' + k + '"></canvas><div class="cr-minibox"></div></div></div>';
        }).join('') + '</div><div class="cr-banner hidden" id="crBanner"></div><div class="cr-overlay hidden" id="crOv"></div></div>';
    }
    ['main', 'a', 'b'].forEach(board);
  }

  function render(p) {
    P = p; G = p.game;
    if (layout !== G.mode + ':' + i18n.getLang()) mount(G.mode);
    header();
    // модификаторы влияют на вид холстов
    document.querySelectorAll('.cr-board-wrap').forEach(function (w) {
      w.classList.toggle('tilt', G.mod === 'tilt' && (G.phase === 'draw' || G.phase === 'claimed'));
      w.classList.toggle('mini', G.mod === 'mini');
    });
    banner();
    if (G.mode === 'solo') renderSolo(); else renderDuel();
    strip();
  }

  function header() {
    var ph = G.phase, title = '', sub = '';
    var turn = G.mode === 'solo' ? t('croc.turn', { n: G.turnNo, total: G.turnsTotal }) : t('croc.turnInf', { n: G.turnNo });
    if (G.mode === 'solo') {
      if (ph === 'choose') title = t('croc.chooseTv', { name: nm(G.artist) });
      else if (ph === 'draw') title = t('croc.draws', { name: nm(G.artist) });
      else if (ph === 'reveal') title = t('croc.wordWas', { word: G.word });
      else if (ph === 'vote') { title = t('croc.vote'); turn = t('croc.voteTv'); }
      sub = turn + (G.level && ph !== 'vote' ? ' · ' + t('croc.level.' + G.level) : '');
    } else {
      if (ph === 'teams') { title = t('croc.teams'); sub = t('croc.teamsWait'); }
      else {
        title = ph === 'claimed' ? t('croc.claimed', { team: t('croc.team.' + G.claimTeam) }) :
          ph === 'reveal' ? (G.winner ? t('croc.teamWins', { team: t('croc.team.' + G.winner), n: G.points }) : t('croc.timeout')) :
          t('croc.artistsNow', { a: nm(G.artists.a), b: nm(G.artists.b) });
        sub = turn + ' · ' + t('croc.target', { n: G.target });
      }
    }
    if (G.mod && ph !== 'vote' && ph !== 'teams') sub += ' · ⚡ ' + t('croc.mod.' + G.mod) + ' (' + t('croc.modBonus') + ')';
    $('phaseTitle').textContent = title;
    $('phaseSub').textContent = sub;
  }

  function banner() {
    var key = G.turnNo + ':' + G.mod;
    var el = $('crBanner');
    if (!el) return;
    if (G.mod && (G.phase === 'draw' || G.phase === 'choose') && lastBanner !== key) {
      lastBanner = key;
      el.innerHTML = '<div class="crb-in"><div class="crb-k">⚡ ' + esc(t('croc.mod.' + G.mod)) + '</div><div class="crb-d">' +
        esc(t('croc.mod.' + G.mod + '.d')) + ' · ' + esc(t('croc.modBonus')) + '</div></div>';
      el.classList.remove('hidden');
      clearTimeout(el._t);
      el._t = setTimeout(function () { el.classList.add('hidden'); }, 3500);
    }
  }

  /* ------------------------------ Личный ------------------------------ */
  function renderSolo() {
    var ph = G.phase;
    // маска слова / слово
    var mask = $('crMask');
    if (ph === 'draw' && G.mask) mask.innerHTML = G.mask.map(function (ch) {
      return ch === ' ' ? '<span class="sp"></span>' : '<span class="' + (ch === '_' ? 'blank' : 'open') + '">' + esc(ch === '_' ? '' : ch) + '</span>';
    }).join('');
    else if (ph === 'reveal') mask.innerHTML = '<span class="word">' + esc(G.word) + '</span>';
    else mask.innerHTML = '';
    // правая колонка
    var side = $('crSide');
    if (ph === 'reveal') {
      var rows = Object.keys(G.points).sort(function (a, b) { return G.points[b] - G.points[a]; }).map(function (id) {
        var g = (G.guessed || []).find(function (x) { return x.id === id; });
        return '<div class="cr-prow">' + U.avatar(pl(id)) + '<span>' + esc(nm(id)) + (id === G.artist ? ' 🎨' : '') +
          (g && g.almost ? ' <em>' + esc(t('croc.almost')) + '</em>' : '') + '</span><b>+' + G.points[id] + '</b></div>';
      }).join('');
      side.innerHTML = '<div class="cr-side-h">🏁 ' + esc(t('croc.points')) + (G.mult !== 1 ? ' ×' + G.mult : '') + '</div>' +
        (rows || '<div class="cr-none">😶 ' + esc(t('croc.nobodyGuessed')) + '</div>');
      feed = [];
    } else if (ph === 'draw' || ph === 'choose') {
      var gs = (G.guessed || []).map(function (g) {
        return '<div class="cr-ok">' + U.avatar(pl(g.id)) + esc(t('croc.guessed', { name: nm(g.id) })) + (g.almost ? ' <em>' + esc(t('croc.almost')) + '</em>' : '') + '</div>';
      }).join('');
      // всплывающие неправильные догадки (из состояния — переживают перезагрузку ТВ)
      var wk = JSON.stringify(G.wrong);
      if (wk !== lastWrongKey) { lastWrongKey = wk; feed = (G.wrong || []).slice(-8); }
      side.innerHTML = '<div class="cr-side-h">' + (ph === 'choose' ? '🤔' : '✏️') + ' ' + esc(ph === 'choose' ? t('croc.chooseTv', { name: nm(G.artist) }) : t('croc.guessHint')) + '</div>' +
        gs + '<div class="cr-feed">' + feed.slice().reverse().map(function (w, i) {
          return '<div class="cr-bubble' + (i === 0 ? ' fresh' : '') + '"><b>' + esc(nm(w.id)) + ':</b> ' + esc(w.text) + '</div>';
        }).join('') + '</div>';
    }
    if (ph === 'choose') { var b = board('main'); if (b && b.strokes.length) b.reset([]); }
    // голосование «Мимо кассы»
    var ov = $('crOv');
    if (ph === 'vote') {
      ov.classList.remove('hidden');
      ov.innerHTML = '<h1>😂 ' + esc(t('croc.vote')) + '</h1><div class="lobby-note">' + esc(t('croc.voteHint')) + '</div><div class="cr-votes">' +
        G.vote.cands.map(function (c) {
          var n = G.vote.counts[c.i] || 0;
          return '<div class="cr-vote"><div class="cr-vtext">«' + esc(c.text) + '»</div><div class="cr-vwho">' + esc(nm(c.id)) + '</div><div class="cr-vn">' + (n ? '❤ ' + n : '') + '</div></div>';
        }).join('') + '</div>';
    } else ov.classList.add('hidden');
  }

  /* ------------------------------ Дуэль ------------------------------ */
  function renderDuel() {
    var ph = G.phase;
    var race = $('crRace');
    race.innerHTML = ['a', 'b'].map(function (k) {
      var pct = Math.min(100, 100 * (G.teamScore[k] || 0) / G.target);
      return '<div class="lane team-' + k + '"><span class="lane-name">' + esc(t('croc.team.' + k)) + '</span><div class="track"><div class="fill" style="width:' + pct + '%"></div>' +
        '<div class="runner" style="left:' + pct + '%">' + (k === 'a' ? '🐊' : '🦖') + '</div><div class="finish">🏁</div></div><b>' + (G.teamScore[k] || 0) + '</b></div>';
    }).join('');
    ['a', 'b'].forEach(function (k) {
      var el = $('crArt_' + k);
      el.innerHTML = G.artists ? U.avatar(pl(G.artists[k])) + '<span>🎨 ' + esc(nm(G.artists[k])) + '</span>' : esc(t('croc.team.' + k));
    });
    var ov = $('crOv');
    if (ph === 'teams') {
      ov.classList.remove('hidden');
      ov.innerHTML = '<h1>⚔️ ' + esc(t('croc.teams')) + '</h1><div class="cr-teams">' + ['a', 'b'].map(function (k) {
        return '<div class="cr-team team-' + k + '"><h2>' + esc(t('croc.team.' + k)) + '</h2>' + G.teams[k].map(function (id) {
          return '<div class="cr-tm">' + U.avatar(pl(id)) + esc(nm(id)) + '</div>';
        }).join('') + '</div>';
      }).join('') + '</div><div class="lobby-note">' + esc(t('croc.teamsSub')) + '</div>';
    } else if (ph === 'claimed' || ph === 'reveal') {
      ov.classList.remove('hidden');
      var team = ph === 'claimed' ? G.claimTeam : G.winner;
      ov.className = 'cr-overlay compact' + (team ? ' team-' + team : '');
      ov.innerHTML = '<div class="cr-word">' + esc(G.word) + '</div><div class="cr-claim">' +
        esc(team ? (ph === 'claimed' ? t('croc.claimed', { team: t('croc.team.' + team) }) : t('croc.teamWins', { team: t('croc.team.' + team), n: G.points })) : t('croc.timeout')) + '</div>';
      return;
    } else ov.classList.add('hidden');
    ov.className = 'cr-overlay' + (ph === 'teams' ? '' : ' hidden');
  }

  function strip() {
    var ids = G.participants;
    if (G.mode === 'duel') {
      $('strip').innerHTML = ['a', 'b'].map(function (k) {
        return '<div class="cr-strip-team team-' + k + '">' + ((G.teams && G.teams[k]) || []).map(function (id) {
          var art = G.artists && G.artists[k] === id;
          return '<div class="pcol' + (art ? ' turn' : '') + '">' + U.avatar(pl(id)) + '<div class="pname">' + (art ? '🎨 ' : '') + esc(nm(id)) + '</div></div>';
        }).join('') + '</div>';
      }).join('');
      return;
    }
    $('strip').innerHTML = ids.slice().sort(function (a, b) { return (G.scores[b] || 0) - (G.scores[a] || 0); }).map(function (id) {
      var guessed = (G.guessed || []).some(function (g) { return g.id === id; }) && G.phase === 'draw';
      var art = G.artist === id && G.phase !== 'vote';
      return '<div class="pcol' + (art ? ' turn' : '') + (guessed ? ' guessed' : '') + '">' + (guessed ? '<div class="check">✓</div>' : '') +
        U.avatar(pl(id)) + '<div class="pname">' + (art ? '🎨 ' : '') + esc(nm(id)) + '</div><div class="sn-score">' + (G.scores[id] || 0) + '</div></div>';
    }).join('');
  }

  function onEvent(ev, d) {
    if (ev === 'full') { var b = board(d.cv); if (b) b.reset(d.strokes); else pending[d.cv] = d.strokes; }
    else if (ev === 'ops') { var b2 = board(d.cv); if (b2) b2.apply(d.ops); }
    else if (ev === 'wrong') SFX.play('tick');
    else if (ev === 'correct') { /* звук приходит отдельным sfx */ }
  }

  function unmount() {
    Object.keys(boards).forEach(function (k) { boards[k].destroy(); });
    boards = {}; pending = {}; layout = null; P = G = null; lastBanner = null; feed = []; lastWrongKey = null;
  }

  window.GAMES = window.GAMES || {};
  (window.GAMES.croc = window.GAMES.croc || {}).tv = { render: render, unmount: unmount, onEvent: onEvent };
})();

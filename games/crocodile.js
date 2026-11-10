'use strict';
/*
 * «Крокодил» — рисовальная игра, два режима.
 *   solo — «Личный» (3–10): художник выбирает слово из трёх, остальные пишут догадки.
 *   duel — «Дуэль» (4–12): две команды, два художника рисуют одно слово одновременно,
 *          угадывают вслух, художник жмёт «Угадали!».
 *
 * Рисунок передаётся как штрихи (нормированные координаты 0…1000), батчами.
 * Протокол операций (одинаковый для телефона, сервера и ТВ):
 *   {o:'s', id, c, w, e, p:[x,y]}  — начало штриха (цвет, толщина 0/1, ластик)
 *   {o:'a', id, p:[x,y,…]}         — продолжение штриха
 *   {o:'end', id}                  — палец оторван
 *   {o:'u'}                        — отменить последний штрих
 *   {o:'x'}                        — очистить холст
 */
const WORDS = require('../data/words');
const { pick, shuffle, randInt, normalize, levenshtein, rankByScore } = require('../lib/util');

const T = { choose: 10, drawSolo: 80, reveal: 7, vote: 25, drawDuel: 90, claimWindow: 5, claimLock: 10, duelReveal: 5, banner: 0 };
const LEVEL_MULT = { easy: 1, medium: 1.5, hard: 2 };
const MOD_MULT = 1.5;
const MODS = ['oneline', 'nocolor', 'blind', 'tilt', 'mini'];
const MOD_CHANCE = 0.6;
const GUESS_POINTS = [10, 8, 6];
const ARTIST_PER_GUESS = 3;
const COLORS = 6;
const MINI = [300, 700];          // «Мини»: квадрат 40% холста по центру
const MAX_STROKES = 1500;
const MAX_POINTS_BATCH = 600;

function maskOf(word, revealed) {
  return [...word].map((ch, i) => (/[\p{L}\p{N}]/u.test(ch) ? (revealed.includes(i) ? ch : '_') : ch));
}

function checkGuess(guess, word) {
  const g = normalize(guess), w = normalize(word);
  if (!g) return null;
  if (g === w) return 'exact';
  const letters = [...w.replace(/\s/g, '')].length;
  if (letters >= 5 && levenshtein(g, w) <= 1) return 'almost';
  return null;
}

function create(api, opts) {
  const mode = opts.mode === 'duel' ? 'duel' : 'solo';
  const lang = api.settings.lang === 'en' ? 'en' : 'ru';
  const dict = WORDS[lang];
  const usedWords = new Set();
  const G = {
    mode, phase: mode === 'duel' ? 'teams' : 'choose',
    participants: api.players.filter((p) => p.connected).map((p) => p.id),
    scores: {}, turnNo: 0, turns: [], turn: null,
    canvases: {},            // cv -> { strokes: [], ended: n }
    teams: null,             // duel: { a: [ids], b: [ids] }
    teamScore: { a: 0, b: 0 }, teamIdx: { a: 0, b: 0 },
    stats: { artistPts: {}, firsts: {}, claims: {} },
    allWrong: [],            // все неправильные догадки партии (для «Мимо кассы»)
    vote: null, lastReveal: null, banner: null
  };
  G.participants.forEach((id) => { G.scores[id] = 0; });
  let jobs = [];
  const later = (ms, fn) => { const c = api.later(ms, fn); jobs.push(c); return c; };
  const cancelJobs = () => { jobs.forEach((c) => c()); jobs = []; };
  const isPart = (id) => G.participants.includes(id) && api.getPlayer(id);
  const alive = (ids) => ids.filter((id) => api.getPlayer(id));
  const scaled = (sec) => sec * 1000 * api.timeScale;

  function takeWord(level) {
    const list = dict[level].filter((w) => !usedWords.has(w));
    const w = pick(list.length ? list : dict[level]);
    usedWords.add(w);
    return w;
  }

  function pickMod(circleLen) {
    // Модификаторы — со второго круга (если круг один — со второй половины ходов)
    if (G.turnNo <= circleLen) return null;
    return Math.random() < MOD_CHANCE ? pick(MODS) : null;
  }

  function resetCanvas(cv) {
    G.canvases[cv] = { strokes: [], ended: 0 };
    api.toTv('croc:full', { cv, strokes: [] });
  }

  /* ============================ ЛИЧНЫЙ ============================ */

  function soloSetup() {
    const order = shuffle(G.participants);
    const circles = order.length >= 8 ? 1 : 2;
    for (let c = 0; c < circles; c++) for (const id of order) G.turns.push(id);
    G.circleLen = circles === 1 ? Math.ceil(order.length / 2) : order.length;
    soloNextTurn();
  }

  function soloNextTurn() {
    cancelJobs();
    while (G.turns.length && !api.getPlayer(G.turns[0])) G.turns.shift();
    if (!G.turns.length) return soloVote();
    const artist = G.turns.shift();
    G.turnNo++;
    G.turn = {
      artist, options: { easy: takeWord('easy'), medium: takeWord('medium'), hard: takeWord('hard') },
      word: null, level: null, mod: pickMod(G.circleLen), revealed: [],
      guessed: [], almost: {}, wrong: [], points: null, started: 0
    };
    G.phase = 'choose';
    resetCanvas('main');
    api.setTimer(T.choose, () => soloChoose(G.turn.artist, 'medium'));
    api.sync();
  }

  function soloChoose(pid, level) {
    const tr = G.turn;
    if (G.phase !== 'choose' || pid !== tr.artist || !LEVEL_MULT[level]) return;
    tr.level = level;
    tr.word = tr.options[level];
    G.phase = 'draw';
    tr.started = Date.now();
    api.setTimer(T.drawSolo, soloEndTurn);
    api.sync();
  }

  function guessersOf(tr) { return alive(G.participants).filter((id) => id !== tr.artist); }

  function soloHints() {
    const tr = G.turn, tm = api.timer;
    if (G.phase !== 'draw' || !tm || !tr.word) return;
    const elapsed = 1 - tm.remaining / tm.total;     // 40 и 60 сек из 80 → 0.5 и 0.75
    const want = elapsed >= 0.75 ? 2 : elapsed >= 0.5 ? 1 : 0;
    if (tr.revealed.length >= want) return;
    const letters = [...tr.word].map((ch, i) => (/[\p{L}\p{N}]/u.test(ch) ? i : -1)).filter((i) => i >= 0 && !tr.revealed.includes(i));
    if (letters.length > 1) { tr.revealed.push(pick(letters)); api.sync(); }
    else tr.revealed.push(-1);
  }

  function soloGuess(player, text) {
    const tr = G.turn;
    if (G.phase !== 'draw' || !isPart(player.id) || player.id === tr.artist) return;
    if (tr.guessed.includes(player.id)) return;
    text = String(text || '').trim().slice(0, 40);
    if (!text) return;
    const res = checkGuess(text, tr.word);
    if (res) {
      tr.guessed.push(player.id);
      if (res === 'almost') tr.almost[player.id] = true;
      api.toPlayer(player.id, 'croc:guess', { ok: true, almost: res === 'almost' });
      api.toTv('croc:correct', { id: player.id, almost: res === 'almost' });
      api.sfx('ok');
      api.sfx('ok', player.id);
      if (guessersOf(tr).every((id) => tr.guessed.includes(id))) return soloEndTurn();
      api.sync();
    } else {
      const g = { id: player.id, text, turn: G.turnNo };
      tr.wrong.push(g);
      G.allWrong.push(g);
      api.toPlayer(player.id, 'croc:guess', { ok: false });
      api.toTv('croc:wrong', { id: player.id, text });
      api.sync();
    }
  }

  function soloEndTurn() {
    const tr = G.turn;
    if (G.phase !== 'draw' && G.phase !== 'choose') return;
    if (!tr.word) { tr.level = 'medium'; tr.word = tr.options.medium; }
    const mult = LEVEL_MULT[tr.level] * (tr.mod ? MOD_MULT : 1);
    const pts = {};
    tr.guessed.forEach((id, i) => { pts[id] = Math.round((GUESS_POINTS[i] != null ? GUESS_POINTS[i] : 4) * mult); });
    const artistPts = Math.round(ARTIST_PER_GUESS * tr.guessed.length * mult);
    if (artistPts) pts[tr.artist] = artistPts;
    for (const [id, n] of Object.entries(pts)) G.scores[id] = (G.scores[id] || 0) + n;
    G.stats.artistPts[tr.artist] = (G.stats.artistPts[tr.artist] || 0) + artistPts;
    if (tr.guessed[0]) G.stats.firsts[tr.guessed[0]] = (G.stats.firsts[tr.guessed[0]] || 0) + 1;
    tr.points = pts;
    tr.mult = mult;
    G.phase = 'reveal';
    api.sfx(tr.guessed.length ? 'win' : 'err');
    api.setTimer(T.reveal, soloNextTurn);
    api.sync();
  }

  function soloVote() {
    // Кандидаты: уникальные неправильные догадки (не больше 12, случайные)
    const seen = new Set(), cands = [];
    for (const g of shuffle(G.allWrong)) {
      const k = g.id + '|' + normalize(g.text);
      if (seen.has(k) || !api.getPlayer(g.id)) continue;
      seen.add(k);
      cands.push({ i: cands.length, id: g.id, text: g.text });
      if (cands.length >= 12) break;
    }
    if (cands.length < 2) return soloFinish(cands[0] || null);
    G.phase = 'vote';
    G.vote = { cands, votes: {} };
    api.setTimer(T.vote, () => soloFinish(null));
    api.sync();
  }

  function soloVoteAction(player, i) {
    const v = G.vote;
    if (G.phase !== 'vote' || !isPart(player.id) || !v.cands[i] || v.cands[i].id === player.id) return;
    v.votes[player.id] = i;
    const voters = alive(G.participants).filter((id) => v.cands.some((c) => c.id !== id));
    if (voters.every((id) => v.votes[id] != null)) return soloFinish(null);
    api.sync();
  }

  function soloFinish(single) {
    let funny = single;
    if (G.vote) {
      const counts = {};
      Object.values(G.vote.votes).forEach((i) => { counts[i] = (counts[i] || 0) + 1; });
      const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      funny = best ? G.vote.cands[+best[0]] : null;
    }
    const ids = alive(G.participants);
    const scoreOf = (id) => G.scores[id] || 0;
    const top = (obj) => {
      const e = Object.entries(obj).filter(([id, v]) => v > 0 && api.getPlayer(id)).sort((a, b) => b[1] - a[1])[0];
      return e ? e[0] : null;
    };
    api.finish({
      ranking: rankByScore(ids, scoreOf),
      scores: Object.fromEntries(ids.map((id) => [id, scoreOf(id)])),
      titles: [
        { key: 'title.croc.picasso', playerId: top(G.stats.artistPts) },
        { key: 'title.croc.psychic', playerId: top(G.stats.firsts) },
        funny && { key: 'title.croc.funny', playerId: funny.id, text: funny.text }
      ]
    });
  }

  /* ============================ ДУЭЛЬ ============================ */

  function duelSplit() {
    const ids = shuffle(G.participants);
    G.teams = { a: [], b: [] };
    ids.forEach((id, i) => G.teams[i % 2 ? 'b' : 'a'].push(id));
  }

  function teamOf(id) { return G.teams && (G.teams.a.includes(id) ? 'a' : G.teams.b.includes(id) ? 'b' : null); }

  function duelStart() {
    if (G.phase !== 'teams') return null;
    if (alive(G.teams.a).length < 2 || alive(G.teams.b).length < 2) return { key: 'err.teams' };
    duelNextTurn();
    return null;
  }

  function duelNextTurn() {
    cancelJobs();
    const target = api.settings.duelTarget || 15;
    const ta = alive(G.teams.a), tb = alive(G.teams.b);
    if (G.teamScore.a >= target || G.teamScore.b >= target || !ta.length || !tb.length) return duelFinish();
    G.turnNo++;
    const circleLen = Math.max(ta.length, tb.length);
    const artistA = ta[G.teamIdx.a++ % ta.length];
    const artistB = tb[G.teamIdx.b++ % tb.length];
    G.turn = { artists: { a: artistA, b: artistB }, word: takeWord('medium'), level: 'medium', mod: pickMod(circleLen),
      claim: null, locks: {}, saved: 0, winner: null, points: 0, cancelled: 0 };
    G.phase = 'draw';
    resetCanvas('a');
    resetCanvas('b');
    api.setTimer(T.drawDuel, () => duelEndTurn(null));
    api.sync();
  }

  function duelClaim(player, now) {
    const tr = G.turn;
    if (G.phase !== 'draw') return;
    const team = tr.artists.a === player.id ? 'a' : tr.artists.b === player.id ? 'b' : null;
    if (!team) return;
    if (tr.locks[player.id] && now < tr.locks[player.id]) return;
    // Первое нажатие фиксирует сервер; ход ставится на паузу на окно отмены
    tr.saved = api.timer ? api.timer.remaining / api.timeScale / 1000 : 0;
    tr.claim = { team, by: player.id, at: now };
    G.phase = 'claimed';
    api.sfx('ok');
    api.setTimer(T.claimWindow, () => duelEndTurn(team));
    api.sync();
  }

  function duelUndo() {
    const tr = G.turn;
    if (G.phase !== 'claimed' || !tr.claim) return null;
    tr.locks[tr.claim.by] = Date.now() + scaled(T.claimLock);
    tr.claim = null;
    tr.cancelled++;
    G.phase = 'draw';
    api.sfx('err');
    api.setTimer(Math.max(1, tr.saved), () => duelEndTurn(null));
    api.sync();
    return null;
  }

  function duelEndTurn(team) {
    const tr = G.turn;
    if (G.phase !== 'draw' && G.phase !== 'claimed') return;
    tr.winner = team;
    tr.points = team ? Math.round(3 * (tr.mod ? MOD_MULT : 1)) : 0;
    if (team) {
      G.teamScore[team] += tr.points;
      G.stats.claims[tr.artists[team]] = (G.stats.claims[tr.artists[team]] || 0) + 1;
    }
    G.phase = 'reveal';
    api.sfx(team ? 'win' : 'err');
    api.setTimer(T.duelReveal, duelNextTurn);
    api.sync();
  }

  function duelFinish() {
    const ta = alive(G.teams.a), tb = alive(G.teams.b);
    const teams = [
      { key: 'a', name: 'croc.team.a', color: '#ff595e', ids: ta, score: G.teamScore.a },
      { key: 'b', name: 'croc.team.b', color: '#1982c4', ids: tb, score: G.teamScore.b }
    ];
    teams.forEach((tm) => tm.ids.forEach((id) => { G.scores[id] = tm.score; }));
    const ranking = G.teamScore.a === G.teamScore.b ? [ta.concat(tb)]
      : G.teamScore.a > G.teamScore.b ? [ta, tb] : [tb, ta];
    const best = Object.entries(G.stats.claims).filter(([id]) => api.getPlayer(id)).sort((a, b) => b[1] - a[1])[0];
    api.finish({
      ranking, teams: teams.sort((x, y) => y.score - x.score),
      scores: Object.fromEntries(ta.concat(tb).map((id) => [id, G.scores[id]])),
      titles: [best && { key: 'title.croc.picasso', playerId: best[0] }]
    });
  }

  /* ============================ рисование ============================ */

  function artistCanvas(id) {
    if (mode === 'solo') return G.turn && G.turn.artist === id && G.phase === 'draw' ? 'main' : null;
    if (!G.turn || G.phase !== 'draw') return null;
    return G.turn.artists.a === id ? 'a' : G.turn.artists.b === id ? 'b' : null;
  }

  const clampN = (v) => Math.max(0, Math.min(1000, Math.round(+v) || 0));

  function cleanPoints(p, mini) {
    if (!Array.isArray(p)) return [];
    const out = [];
    for (let i = 0; i + 1 < p.length && i < MAX_POINTS_BATCH; i += 2) {
      let x = clampN(p[i]), y = clampN(p[i + 1]);
      if (mini) { x = Math.max(MINI[0], Math.min(MINI[1], x)); y = Math.max(MINI[0], Math.min(MINI[1], y)); }
      out.push(x, y);
    }
    return out;
  }

  function draw(player, ops) {
    const cv = artistCanvas(player.id);
    if (!cv || !Array.isArray(ops)) return;
    const C = G.canvases[cv], mod = G.turn.mod, out = [];
    for (const op of ops.slice(0, 50)) {
      if (!op || typeof op.o !== 'string') continue;
      if (op.o === 's') {
        if (C.strokes.length >= MAX_STROKES) continue;
        if (mod === 'oneline' && (C.ended > 0 || C.strokes.length > 0)) continue;
        const s = {
          id: String(op.id).slice(0, 20),
          c: mod === 'nocolor' ? 0 : Math.max(0, Math.min(COLORS - 1, op.c | 0)),
          w: op.w ? 1 : 0, e: !!op.e,
          p: cleanPoints(op.p, mod === 'mini')
        };
        C.strokes.push(s);
        out.push({ o: 's', id: s.id, c: s.c, w: s.w, e: s.e, p: s.p });
      } else if (op.o === 'a') {
        const s = C.strokes[C.strokes.length - 1];
        if (!s || s.id !== String(op.id).slice(0, 20) || s.done) continue;
        const p = cleanPoints(op.p, mod === 'mini');
        s.p.push(...p);
        out.push({ o: 'a', id: s.id, p });
      } else if (op.o === 'end') {
        const s = C.strokes[C.strokes.length - 1];
        if (s) s.done = true;
        C.ended++;
        out.push({ o: 'end', id: op.id });
      } else if (op.o === 'u') {
        if (mod === 'oneline') continue;
        C.strokes.pop();
        out.push({ o: 'u' });
      } else if (op.o === 'x') {
        if (mod === 'oneline') continue;
        C.strokes = [];
        out.push({ o: 'x' });
      }
    }
    if (out.length) api.toTv('croc:ops', { cv, ops: out });
  }

  /* ============================ представления ============================ */

  function strokesOf(cv) { return G.canvases[cv] ? G.canvases[cv].strokes : []; }

  function tvView() {
    const tr = G.turn, ph = G.phase;
    const v = {
      mode, phase: ph, turnNo: G.turnNo, scores: G.scores, participants: alive(G.participants),
      mod: tr ? tr.mod : null, target: api.settings.duelTarget || 15
    };
    if (mode === 'solo') {
      v.turnsTotal = G.turnNo + G.turns.length;
      if (tr) {
        v.artist = tr.artist;
        v.level = ph === 'choose' ? null : tr.level;
        v.mask = tr.word && ph === 'draw' ? maskOf(tr.word, tr.revealed) : null;
        v.guessed = tr.guessed.map((id) => ({ id, almost: !!tr.almost[id] }));
        v.wrong = tr.wrong.slice(-10);
        if (ph === 'reveal') Object.assign(v, { word: tr.word, points: tr.points, mult: tr.mult });
      }
      if (ph === 'vote') v.vote = { cands: G.vote.cands, counts: countVotes(), voted: Object.keys(G.vote.votes).length };
    } else {
      v.teams = G.teams;
      v.teamScore = G.teamScore;
      if (tr && ph !== 'teams') {
        v.artists = tr.artists;
        v.cancelled = tr.cancelled;
        v.claim = tr.claim;
        if (ph === 'claimed' || ph === 'reveal') Object.assign(v, { word: tr.word, winner: tr.winner, points: tr.points });
        if (ph === 'claimed') v.claimTeam = tr.claim && tr.claim.team;
        v.letters = [...tr.word].filter((ch) => /[\p{L}]/u.test(ch)).length;
      }
    }
    return v;
  }

  function countVotes() {
    const c = {};
    Object.values(G.vote.votes).forEach((i) => { c[i] = (c[i] || 0) + 1; });
    return c;
  }

  function playerView(p) {
    if (!G.participants.includes(p.id)) return { spectator: true, mode, phase: G.phase };
    const tr = G.turn, ph = G.phase;
    const v = { mode, phase: ph, turnNo: G.turnNo, score: G.scores[p.id] || 0, mod: tr ? tr.mod : null };
    if (mode === 'solo') {
      if (!tr) return v;
      v.artist = tr.artist;
      v.isArtist = tr.artist === p.id;
      if (v.isArtist && ph === 'choose') v.options = tr.options;
      if (v.isArtist && (ph === 'draw')) { v.word = tr.word; v.level = tr.level; v.canDraw = true; }
      if (!v.isArtist && ph === 'draw') {
        v.mask = maskOf(tr.word, tr.revealed);
        v.guessed = tr.guessed.includes(p.id);
        v.almost = !!tr.almost[p.id];
      }
      if (ph === 'reveal') Object.assign(v, { word: tr.word, myPoints: tr.points[p.id] || 0 });
      if (ph === 'vote') v.vote = { cands: G.vote.cands, mine: G.vote.votes[p.id] };
    } else {
      v.team = teamOf(p.id);
      v.teams = G.teams;
      v.teamScore = G.teamScore;
      if (tr && ph !== 'teams') {
        const my = tr.artists.a === p.id ? 'a' : tr.artists.b === p.id ? 'b' : null;
        v.isArtist = !!my;
        v.artists = tr.artists;
        if (my && (ph === 'draw' || ph === 'claimed')) {
          v.word = tr.word; v.canDraw = ph === 'draw';
          const lk = tr.locks[p.id];
          v.lockLeft = lk && lk > Date.now() ? lk - Date.now() : 0;
        }
        if (ph === 'claimed' || ph === 'reveal') Object.assign(v, { word: tr.word, winner: tr.winner, claimTeam: tr.claim && tr.claim.team });
      }
    }
    return v;
  }

  /* ============================ боты ============================ */

  function botDraw(p, cv) {
    const id = 'b' + Math.random().toString(36).slice(2, 7);
    let x = randInt(150, 850), y = randInt(150, 850);
    const steps = randInt(6, 14);
    api.act(p, 'draw', { ops: [{ o: 's', id, c: randInt(0, 5), w: randInt(0, 1), p: [x, y] }] });
    let k = 0;
    const step = () => {
      if (artistCanvas(p.id) !== cv) return;
      if (k++ >= steps) { api.act(p, 'draw', { ops: [{ o: 'end', id }] }); later(randInt(300, 1200), () => { if (artistCanvas(p.id) === cv) botDraw(p, cv); }); return; }
      const pts = [];
      for (let j = 0; j < 3; j++) { x = Math.max(20, Math.min(980, x + randInt(-60, 60))); y = Math.max(20, Math.min(980, y + randInt(-60, 60))); pts.push(x, y); }
      api.act(p, 'draw', { ops: [{ o: 'a', id, p: pts }] });
      later(50, step);
    };
    later(50, step);
  }

  function bot(p) {
    const m = p.memo, tr = G.turn, ph = G.phase;
    if (!tr || !isPart(p.id)) return;
    const key = G.turnNo + ':' + ph;
    const once = (k, ms, fn) => { if (m[k]) return; m[k] = true; later(ms, fn); };
    if (mode === 'solo') {
      if (ph === 'choose' && tr.artist === p.id) once(key, randInt(1000, 3000), () => api.act(p, 'choose', { level: pick(['easy', 'medium', 'hard']) }));
      if (ph === 'draw' && tr.artist === p.id) once(key, 300, () => botDraw(p, 'main'));
      if (ph === 'draw' && tr.artist !== p.id) {
        const total = T.drawSolo * 1000 * api.timeScale;
        // 1–3 неправильные догадки и с вероятностью 65% — правильная (иногда с опечаткой)
        const wrongN = randInt(1, 3);
        for (let i = 0; i < wrongN; i++) {
          once(key + ':w' + i, randInt(0.05 * total, 0.8 * total), () => api.act(p, 'guess', { text: pick(dict[pick(['easy', 'medium'])]) }));
        }
        if (Math.random() < 0.65) {
          once(key + ':ok', randInt(0.15 * total, 0.9 * total), () => {
            const w = G.turn.word;
            const typo = w.length >= 6 && Math.random() < 0.25 ? w.slice(0, -1) : w.toUpperCase();
            api.act(p, 'guess', { text: typo });
          });
        } else m[key + ':ok'] = true;
      }
      if (ph === 'vote') {
        const c = G.vote.cands.filter((x) => x.id !== p.id);
        if (c.length) once(key, randInt(2000, 8000), () => api.act(p, 'vote', { i: pick(c).i }));
      }
    } else {
      const my = tr.artists && (tr.artists.a === p.id ? 'a' : tr.artists.b === p.id ? 'b' : null);
      if (ph === 'draw' && my) {
        once(key + ':draw' + tr.cancelled, 300, () => botDraw(p, my));
        // жмёт «Угадали!» через случайные 20–80 сек
        once(key + ':claim' + tr.cancelled, randInt(20, 80) * 1000 * api.timeScale, () => api.act(p, 'claim'));
      }
    }
  }

  /* ============================ интерфейс модуля ============================ */

  return {
    start() {
      if (mode === 'solo') soloSetup();
      else { duelSplit(); api.sync(); }
    },
    action(player, type, data, now) {
      if (type === 'draw') return draw(player, data.ops);
      if (mode === 'solo') {
        if (type === 'choose') soloChoose(player.id, data.level);
        else if (type === 'guess') soloGuess(player, data.text);
        else if (type === 'vote') soloVoteAction(player, data.i | 0);
      } else if (type === 'claim') duelClaim(player, now);
    },
    host(type, data) {
      if (mode !== 'duel') return null;
      if (type === 'croc:move' && G.phase === 'teams') {
        const id = data.playerId, from = teamOf(id);
        if (!from) return null;
        const to = from === 'a' ? 'b' : 'a';
        G.teams[from] = G.teams[from].filter((x) => x !== id);
        G.teams[to].push(id);
        api.sync();
      } else if (type === 'croc:start') return duelStart();
      else if (type === 'croc:undo') return duelUndo();
      return null;
    },
    tick() { if (mode === 'solo') soloHints(); },
    tvView,
    playerView,
    tvJoin(socket) { for (const cv of Object.keys(G.canvases)) socket.emit('croc:full', { cv, strokes: strokesOf(cv) }); },
    join(p) {
      // Вернувшемуся художнику — его рисунок
      const cv = mode === 'solo' ? (G.turn && G.turn.artist === p.id ? 'main' : null) : (G.turn && G.turn.artists && (G.turn.artists.a === p.id ? 'a' : G.turn.artists.b === p.id ? 'b' : null));
      if (cv) later(300, () => api.toPlayer(p.id, 'croc:full', { cv, strokes: strokesOf(cv) }));
    },
    leave(id) {
      if (mode === 'solo') {
        G.turns = G.turns.filter((x) => x !== id);
        if (G.turn && G.turn.artist === id && (G.phase === 'choose' || G.phase === 'draw')) return soloEndTurn();
        if (G.phase === 'draw' && guessersOf(G.turn).length && guessersOf(G.turn).every((x) => G.turn.guessed.includes(x))) return soloEndTurn();
      } else if (G.teams) {
        G.teams.a = G.teams.a.filter((x) => x !== id);
        G.teams.b = G.teams.b.filter((x) => x !== id);
        if (G.phase !== 'teams' && (!G.teams.a.length || !G.teams.b.length)) return duelFinish();
      }
      api.sync();
    },
    bot,
    destroy() { cancelJobs(); }
  };
}

module.exports = { create, checkGuess, maskOf };

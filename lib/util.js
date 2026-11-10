'use strict';
const os = require('os');

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function median(nums) {
  if (!nums.length) return 0;
  const s = nums.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Нормализация для сравнения слов: регистр, ё=е, лишние пробелы. */
function normalize(s) {
  return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[\s\-‐–—]+/g, ' ').trim();
}

function levenshtein(a, b) {
  a = [...a]; b = [...b];
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

function lanIP() {
  if (process.env.PUBLIC_HOST) return process.env.PUBLIC_HOST;
  const cands = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const n of list || []) {
      if ((n.family !== 'IPv4' && n.family !== 4) || n.internal) continue;
      let score = 0;
      if (/^192\.168\./.test(n.address)) score += 3;
      else if (/^10\./.test(n.address)) score += 2;
      else if (/^172\.(1[6-9]|2\d|3[01])\./.test(n.address)) score += 1;
      if (/^(wl|wlan|wi-?fi|en0|wlp)/i.test(name)) score += 2;
      if (/(docker|veth|br-|vmnet|vbox|virtual|utun|tailscale|zt)/i.test(name)) score -= 5;
      cands.push({ address: n.address, score });
    }
  }
  cands.sort((a, b) => b.score - a.score);
  return cands.length ? cands[0].address : 'localhost';
}

/** Ранжирование по очкам: группы игроков с равным счётом делят место. */
function rankByScore(ids, scoreOf) {
  const sorted = ids.slice().sort((a, b) => scoreOf(b) - scoreOf(a));
  const groups = [];
  for (const id of sorted) {
    const last = groups[groups.length - 1];
    if (last && scoreOf(last[0]) === scoreOf(id)) last.push(id);
    else groups.push([id]);
  }
  return groups;
}

module.exports = { pick, rand, randInt, shuffle, median, normalize, levenshtein, lanIP, rankByScore };

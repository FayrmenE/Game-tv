'use strict';
/*
 * Общий приём штрихов рисования с телефона (формат CANVAS.Pad из public/js/canvas.js).
 * Холст: { strokes: [] }. applyOps проверяет и обрезает данные, возвращает операции для ТВ.
 */
const COLORS = 7;
const MAX_STROKES = 1500;
const MAX_POINTS_BATCH = 600;
const clampN = (v) => Math.max(0, Math.min(1000, Math.round(+v) || 0));

function cleanPoints(p) {
  if (!Array.isArray(p)) return [];
  const out = [];
  for (let i = 0; i + 1 < p.length && i < MAX_POINTS_BATCH; i += 2) out.push(clampN(p[i]), clampN(p[i + 1]));
  return out;
}

function applyOps(C, ops) {
  const out = [];
  if (!Array.isArray(ops)) return out;
  for (const op of ops.slice(0, 50)) {
    if (!op || typeof op.o !== 'string') continue;
    if (op.o === 's') {
      if (C.strokes.length >= MAX_STROKES) continue;
      const s = { id: String(op.id).slice(0, 20), c: Math.max(0, Math.min(COLORS - 1, op.c | 0)), w: op.w ? 1 : 0, e: !!op.e, p: cleanPoints(op.p) };
      C.strokes.push(s);
      out.push({ o: 's', id: s.id, c: s.c, w: s.w, e: s.e, p: s.p });
    } else if (op.o === 'a') {
      const s = C.strokes[C.strokes.length - 1];
      if (!s || s.id !== String(op.id).slice(0, 20) || s.done) continue;
      const p = cleanPoints(op.p);
      s.p.push(...p);
      out.push({ o: 'a', id: s.id, p });
    } else if (op.o === 'end') {
      const s = C.strokes[C.strokes.length - 1];
      if (s) s.done = true;
      out.push({ o: 'end', id: op.id });
    } else if (op.o === 'u') {
      C.strokes.pop();
      out.push({ o: 'u' });
    } else if (op.o === 'x') {
      C.strokes = [];
      out.push({ o: 'x' });
    }
  }
  return out;
}

module.exports = { applyOps, cleanPoints };

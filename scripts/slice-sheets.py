"""Нарезка листов от Gemini на картинки-наклейки.

  python3 scripts/slice-sheets.py <лист.jpg> <столбцов> <рядов> <папка_вывода> <id1,id2,...> [пропустить_ряд]

Ряды и столбцы находятся по белым просветам, фон убирается заливкой от краёв,
вокруг предмета — белая обводка «наклейки» и мягкая тень. Результат — PNG 256×256.
"""
import sys, os
import numpy as np
from PIL import Image, ImageFilter
from collections import deque

def bands(mask, min_gap, min_len):
    on = np.where(mask)[0]
    if not len(on): return []
    segs = [[on[0], on[0]]]
    for x in on[1:]:
        if x - segs[-1][1] <= min_gap: segs[-1][1] = x
        else: segs.append([x, x])
    return [s for s in segs if s[1] - s[0] >= min_len]

def fit(segs, n, prof):
    segs = [list(s) for s in segs]
    while len(segs) > n:   # сливаем самый узкий кусок с ближайшим соседом
        i = min(range(len(segs)), key=lambda k: segs[k][1] - segs[k][0])
        j = 1 if i == 0 else i - 1 if i == len(segs) - 1 else (i - 1 if segs[i][0] - segs[i-1][1] < segs[i+1][0] - segs[i][1] else i + 1)
        a, b = sorted([i, j]); segs[a] = [segs[a][0], segs[b][1]]; del segs[b]
    while len(segs) < n:   # предметы слиплись — режем самый широкий кусок по самому пустому месту
        i = max(range(len(segs)), key=lambda k: segs[k][1] - segs[k][0]); a0, a1 = segs[i]
        lo, hi = a0 + (a1 - a0) // 5, a1 - (a1 - a0) // 5
        cut = lo + int(np.argmin(prof[lo:hi])); segs[i:i+1] = [[a0, cut - 1], [cut + 1, a1]]
    return segs

def cutout(crop):
    a = np.asarray(crop.convert('RGB')).astype(int); h, w, _ = a.shape
    white = a.min(axis=2) > 222; bg = np.zeros((h, w), bool); q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if white[y, x] and not bg[y, x]: bg[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if white[y, x] and not bg[y, x]: bg[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            yy, xx = y + dy, x + dx
            if 0 <= yy < h and 0 <= xx < w and white[yy, xx] and not bg[yy, xx]: bg[yy, xx] = True; q.append((yy, xx))
    im = Image.fromarray(np.dstack([a.astype(np.uint8), np.where(bg, 0, 255).astype(np.uint8)]), 'RGBA')
    return im.crop(im.getbbox())

def sticker(obj, size=256):
    s = max(obj.size); pad = int(s * 0.12)
    c = Image.new('RGBA', (s + 2 * pad, s + 2 * pad), (0, 0, 0, 0))
    c.paste(obj, ((c.width - obj.width) // 2, (c.height - obj.height) // 2), obj)
    al = c.getchannel('A'); r = max(3, int(s * 0.035)) | 1
    halo = al.filter(ImageFilter.MaxFilter(r)).filter(ImageFilter.MaxFilter(r)).filter(ImageFilter.GaussianBlur(1.2))
    shadow = halo.filter(ImageFilter.GaussianBlur(r * 0.8)).point(lambda v: int(v * 0.35))
    out = Image.new('RGBA', c.size, (0, 0, 0, 0))
    sh = Image.new('RGBA', c.size, (20, 16, 40, 0)); sh.putalpha(shadow); out.alpha_composite(sh, (0, int(r * 0.6)))
    wh = Image.new('RGBA', c.size, (255, 255, 255, 0)); wh.putalpha(halo); out.alpha_composite(wh)
    out.alpha_composite(c)
    out = out.resize((size, size), Image.LANCZOS)
    return out.quantize(colors=160, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)

def main(path, ncols, nrows, outdir, ids, skip=None):
    im = Image.open(path).convert('RGB'); a = np.asarray(im).astype(int); ink = a.min(axis=2) < 200
    rows = bands(ink.sum(axis=1) > 2, 25, 40)
    if skip is not None and len(rows) == nrows + 1: rows = rows[:skip] + rows[skip + 1:]
    rows = fit(rows, nrows, ink.sum(axis=1))
    os.makedirs(outdir, exist_ok=True); k = 0
    for y0, y1 in rows:
        prof = ink[y0:y1 + 1].sum(axis=0)
        for x0, x1 in fit(bands(prof > 1, 12, 6), ncols, prof):
            p = 10
            crop = im.crop((max(0, x0 - p), max(0, y0 - p), min(im.width, x1 + p + 1), min(im.height, y1 + p + 1)))
            sticker(cutout(crop)).save(os.path.join(outdir, ids[k] + '.png'), optimize=True); k += 1
    print(path, '->', k, 'картинок')

if __name__ == '__main__':
    a = sys.argv
    main(a[1], int(a[2]), int(a[3]), a[4], a[5].split(','), int(a[6]) if len(a) > 6 else None)

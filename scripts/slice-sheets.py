"""Нарезка листов предметов от Gemini на картинки-наклейки public/img/items/<id>.png.
Запуск из корня проекта: SHEETS_DIR=папка python3 scripts/slice-sheets.py
После нарезки обновите public/js/art-images.js (список id)."""
# Нарезка листов Gemini: ряды и столбцы по «просветам» белого, фон → прозрачный (заливка от краёв)
import sys, json
import numpy as np
from PIL import Image
from collections import deque
import os
IMG=os.environ.get('SHEETS_DIR','sheets/')   # папка с листами от Gemini
# сцена: (файл листа, номер лишнего ряда, который нарисовал Gemini — или None)
SHEETS={'space':('space.jpg',None),'kitchen':('kitchen.jpg',3),'park':('park.jpg',None),'beach':('beach.jpg',3),'office':('office.jpg',None)}
scenes={s['id']:s for s in json.load(open('data/scenes.json'))['scenes']}
OUT='public/img/items/'; DBG=sys.argv[1] if len(sys.argv)>1 else '.'

def bands(mask_1d, min_gap, min_len):
    on=np.where(mask_1d)[0]
    if not len(on): return []
    segs=[[on[0],on[0]]]
    for x in on[1:]:
        if x-segs[-1][1] <= min_gap: segs[-1][1]=x
        else: segs.append([x,x])
    return [s for s in segs if s[1]-s[0]>=min_len]

def merge_to(segs, n):
    segs=[list(s) for s in segs]
    while len(segs)>n:   # сливаем самый узкий сегмент с ближайшим соседом
        i=min(range(len(segs)),key=lambda k:segs[k][1]-segs[k][0])
        if i==0: j=1
        elif i==len(segs)-1: j=i-1
        else: j=i-1 if segs[i][0]-segs[i-1][1] < segs[i+1][0]-segs[i][1] else i+1
        a,b=sorted([i,j]); segs[a]=[segs[a][0],segs[b][1]]; del segs[b]
    return segs

def cutout(crop):
    a=np.asarray(crop.convert('RGB')).astype(int)
    h,w,_=a.shape
    white=(a.min(axis=2)>222)
    bg=np.zeros((h,w),bool); q=deque()
    for x in range(w):
        for y in (0,h-1):
            if white[y,x] and not bg[y,x]: bg[y,x]=True; q.append((y,x))
    for y in range(h):
        for x in (0,w-1):
            if white[y,x] and not bg[y,x]: bg[y,x]=True; q.append((y,x))
    while q:
        y,x=q.popleft()
        for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
            yy,xx=y+dy,x+dx
            if 0<=yy<h and 0<=xx<w and white[yy,xx] and not bg[yy,xx]: bg[yy,xx]=True; q.append((yy,xx))
    alpha=np.where(bg,0,255).astype(np.uint8)
    # мягкий край: пиксели фона рядом с объектом — полупрозрачные по светлоте
    rgba=np.dstack([a.astype(np.uint8),alpha])
    im=Image.fromarray(rgba,'RGBA')
    bb=im.getbbox()
    return im.crop(bb)

report={}
for sid,(fn,skip) in SHEETS.items():
    im=Image.open(IMG+fn).convert('RGB'); a=np.asarray(im).astype(int)
    ink=a.min(axis=2)<200
    rows=bands(ink.sum(axis=1)>2, 25, 40)
    if skip is not None and len(rows)==5: rows=rows[:skip]+rows[skip+1:]
    assert len(rows)==4,(sid,len(rows),rows)
    ids=[it['id'] for it in sorted(scenes[sid]['items'],key=lambda i:i['num'])]
    k=0; sizes=[]
    for (y0,y1) in rows:
        cols=bands(ink[y0:y1+1].sum(axis=0)>1, 12, 6)
        cols=merge_to(cols,6)
        prof=ink[y0:y1+1].sum(axis=0)
        while len(cols)<6:   # кто-то касается соседа — режем самый широкий кусок по самому пустому столбцу
            i=max(range(len(cols)),key=lambda k:cols[k][1]-cols[k][0]); a0,a1=cols[i]
            lo,hi=a0+(a1-a0)//5,a1-(a1-a0)//5
            cut=lo+int(np.argmin(prof[lo:hi])); cols[i:i+1]=[[a0,cut-1],[cut+1,a1]]
        assert len(cols)==6,(sid,len(cols))
        for (x0,x1) in cols:
            pad=10
            crop=im.crop((max(0,x0-pad),max(0,y0-pad),min(im.width,x1+pad+1),min(im.height,y1+pad+1)))
            obj=cutout(crop)
            s=max(obj.size); pad2=int(s*0.12); canvas=Image.new('RGBA',(s+2*pad2,s+2*pad2),(0,0,0,0))
            canvas.paste(obj,((canvas.width-obj.width)//2,(canvas.height-obj.height)//2),obj)
            # стикер: белая обводка по контуру + мягкая тень
            from PIL import ImageFilter
            al=canvas.getchannel('A'); r=max(3,int(s*0.035))|1
            halo=al.filter(ImageFilter.MaxFilter(r)).filter(ImageFilter.MaxFilter(r)).filter(ImageFilter.GaussianBlur(1.2))
            shadow=halo.filter(ImageFilter.GaussianBlur(r*0.8)).point(lambda v:int(v*0.35))
            out=Image.new('RGBA',canvas.size,(0,0,0,0))
            sh=Image.new('RGBA',canvas.size,(20,16,40,0)); sh.putalpha(shadow); out.alpha_composite(sh,(0,int(r*0.6)))
            wh=Image.new('RGBA',canvas.size,(255,255,255,0)); wh.putalpha(halo); out.alpha_composite(wh)
            out.alpha_composite(canvas); canvas=out
            canvas=canvas.resize((256,256),Image.LANCZOS)
            canvas.save(OUT+ids[k]+'.png',optimize=True); sizes.append(obj.size); k+=1
    report[sid]=k
# контрольный лист: все нарезанные предметы на сером фоне с подписью id
allids=[i['id'] for s in SHEETS for i in sorted(scenes[s]['items'],key=lambda i:i['num'])]
sheet=Image.new('RGB',(12*130,len(allids)//12*150),(90,90,110))
from PIL import ImageDraw
d=ImageDraw.Draw(sheet)
for n,i in enumerate(allids):
    t=Image.open(OUT+i+'.png').resize((120,120)); x=(n%12)*130+5; y=(n//12)*150+5
    sheet.paste(t,(x,y),t); d.text((x,y+122),i,fill=(255,255,0))
sheet.save(DBG+'/contact.png'); print(report)

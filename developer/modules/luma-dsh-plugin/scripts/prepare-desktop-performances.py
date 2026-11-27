"""Build Windows performance cels from the original costume drawings and painted snack/bow keys."""
from pathlib import Path
import importlib.util
import json
import numpy as np
import cv2
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
OFFICE=ROOT.parents[1]/'overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d'
ART=ROOT/'art/desktop-performances'
PET=ROOT/'native-desktop/pet-art'
spec=importlib.util.spec_from_file_location('gesture_drawing',ROOT/'scripts/prepare-idle-gestures.py')
gesture=importlib.util.module_from_spec(spec)
spec.loader.exec_module(gesture)

def cut_keys(key,pat=False):
    role,variant=key.rsplit('-',1)
    paired=role in ['gemini','grok']
    board=(ART/'pat' if pat else ART)/(('gemini-grok' if paired else role)+'.png')
    columns=2 if pat else 4
    line=int(role=='grok' if paired else variant=='v1')
    im=np.asarray(Image.open(board).convert('RGBA'))
    h,w=im.shape[:2]
    # Rows share a clear gutter even when an eartip extends past the nominal half.
    col_alpha=im[:,:,3]
    centre=h//2
    ysplit=min(range(centre-h//10,centre+h//10),key=lambda y:int((col_alpha[y]>200).sum())+abs(y-centre)*.04)
    strip=im[0:ysplit] if line==0 else im[ysplit:h]
    cuts=[0]
    for j in range(1,columns):
        at=w*j//columns
        cuts.append(min(range(at-w//16,at+w//16),key=lambda x:int((strip[:,x,3]>210).sum())+abs(x-at)*.04))
    cuts.append(w)
    for x1,x2 in zip(cuts,cuts[1:]):
        cel=strip[:,x1:x2].copy()
        alpha=cel[:,:,3]
        core=np.uint8(alpha>=218)
        n,labels,stats,_=cv2.connectedComponentsWithStats(core)
        if n<=1:raise ValueError(str(board))
        body=1+int(np.argmax(stats[1:,4]))
        distance=cv2.distanceTransform(np.uint8(labels!=body),cv2.DIST_L2,5)
        keep=[body]+[i for i in range(1,n) if stats[i,4]>=5 and distance[labels==i].min()<.10*strip.shape[0]]
        ink=np.isin(labels,keep)
        dist=cv2.distanceTransform(np.uint8(~ink),cv2.DIST_L2,5)
        cel[:,:,3]=np.uint8(255*np.clip((alpha.astype(float)-134)/110,0,1)*np.clip((3.25-dist)/2.25,0,1)+.5)
        yield np.asarray(Image.fromarray(cel).crop(Image.fromarray(cel[:,:,3]).getbbox()))

def drawings(key):
    return [np.asarray(Image.open(PET/n/(key+'.png')).convert('RGBA')) for n in ('greet','drowsy','lunch','ledge')]+list(cut_keys(key))+list(cut_keys(key,True))

def place(image,mark):
    # Anchor the painted face and supporting foot independently of horns and head tilt.
    return gesture.place(image,mark['scale'],mark['contact'],[192,300],mark['collar'],mark['body'])

def build():
    registrations=json.loads((ART/'registration.json').read_text('utf8'))
    output=PET/'performance'
    output.mkdir(exist_ok=True)
    for key,marks in registrations.items():
        if key in ("lu-mi-base","lu-mi-v1"):continue
        cells=[place(im,mark) for im,mark in zip(drawings(key),marks,strict=True)]
        present,bite,ready,bow,pat_ready,pat_response=cells[4:]
        guide=[192,300]
        frames=cells[:4]+[present,gesture.ease_towards(present,bite,.54,guide),bite,
                         gesture.ease_towards(bite,present,.38,guide), ready,
                         gesture.ease_towards(ready,bow,.50,guide),bow,gesture.ease_towards(bow,ready,.54,guide),
                         pat_ready,gesture.ease_towards(pat_ready,pat_response,.48,guide),pat_response,
                         gesture.ease_towards(pat_response,pat_ready,.45,guide)]
        sheet=Image.new('RGBA',(384*4,336*4))
        for i,im in enumerate(frames):
            frame=gesture.straight(im)
            area=frame.getchannel('A').getbbox()
            if not area or min(area[0],area[1],384-area[2],336-area[3])<2:raise ValueError((key,i,'clipped',area))
            sheet.paste(frame,(384*(i%4),336*(i//4)))
        sheet.save(output/(key+'.png'),compress_level=8)

if __name__=='__main__':
    build()
    from original_lumi_performances import build as build_lumi
    build_lumi()

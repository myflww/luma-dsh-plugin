"""Register the two painted keystrokes in each rear and rear three-quarter view.

The source paintings are complete seated Q-style characters. One similarity
transform preserves the head, shoulder, hip and bent knees. No furniture or
keyboard is painted into these images.
"""
import hashlib
from io import BytesIO
import json
import math
import os
from pathlib import Path
from tempfile import NamedTemporaryFile

import cv2
import numpy as np
from PIL import Image

PLUGIN=Path(__file__).resolve().parents[1]
OFFICE=PLUGIN.parents[1]/'overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d'
ART=Path('luma-office/luma-plugin-art/rear-desk')
SOURCE=PLUGIN/'art/desk-q-keys'
CELL=352
HIP=(176,249)
SKULL=116
EXPECTED={f'{role}-{variant}' for role in ('shan','bai-shuangming','lu-mi','jingyuniang','longmama','claude','gemini','grok')
          for variant in (('v1',) if role in ('gemini','grok') else ('base','v1'))}
Y,X=np.indices((CELL,CELL),dtype='float32')


def masked_bounds(alpha):
    # Ignore isolated sampling dust but retain separate head accessories.
    _,label,stats,_=cv2.connectedComponentsWithStats(np.uint8(alpha>25))
    keep=np.array([False]+[s[cv2.CC_STAT_AREA]>max(10,alpha.size*.00010) for s in stats[1:]])
    valid=keep[label]
    if not valid.any():
        raise ValueError('Empty key')
    return Image.fromarray(np.uint8(valid)*255).getbbox()


def cut_keys(file):
    sheet=Image.open(file).convert('RGBA')
    alpha=np.asarray(sheet)[:,:,3]
    ink=alpha>48
    if ink.mean()>.85:
        raise ValueError('A transparent character sheet is required: '+str(file))
    w,h=sheet.size
    def gap(count):
        size=len(count);a,b=round(size*.38),round(size*.62)
        value=count[a:b]
        # The middle of the blank band is safe for tails and hanging sleeves.
        best=np.flatnonzero(value==value.min())+a
        return int(best[np.argmin(abs(best-size/2))])
    cx,cy=gap(ink.sum(0)),gap(ink.sum(1))
    frames=[]
    for ya,yb in [(0,cy),(cy,h)]:
        for xa,xb in [(0,cx),(cx,w)]:
            tile=sheet.crop((xa,ya,xb,yb))
            frames.append(tile.crop(masked_bounds(np.asarray(tile)[:,:,3])))
    return frames


def pm(im):
    arr=np.array(im,dtype='float32')/255
    arr[:,:,:3]*=arr[:,:,3:4]
    return arr


def rgba(arr):
    rgb=arr.copy()
    rgb[:,:,:3]/=np.maximum(rgb[:,:,3:4],.00001)
    return Image.fromarray(np.uint8(np.clip(rgb,0,1)*255+.5))


def registration(im,rig):
    # Percent coordinates refer to each pose's tight transparent silhouette.
    # The nape is measured independently of ears, horns and hair extending
    # behind the shoulders. Exactly the same scalar is used on both axes.
    w,h=im.size
    crown,nape,hipx,hipy,lx,ly,rx,ry,ankle,kx,ky,fx,fy=rig
    scale=SKULL/((nape-crown)*h/100)
    px,py=hipx*w/100,hipy*h/100
    ox=HIP[0]-px*scale;oy=HIP[1]-py*scale
    at=lambda x,y:[round(ox+x*w*scale/100,2),round(oy+y*h*scale/100,2)]
    image=cv2.warpAffine(pm(im),np.float32([[scale,0,ox],[0,scale,oy]]),(CELL,CELL),flags=cv2.INTER_AREA if scale<1 else cv2.INTER_CUBIC)
    if image[0,:,3].max()>.4 or image[-1,:,3].max()>.4 or image[:,0,3].max()>.4 or image[:,-1,3].max()>.4:
        raise ValueError('Registration clipped the silhouette: '+str(rig))
    return image,{'hip':list(HIP),'head':at(hipx,(crown+nape)/2),'palms':[at(lx,ly),at(rx,ry)],
                  'ankleLine':round(at(hipx,ankle)[1]),'headHeight':SKULL,
                  'knee':at(kx,ky),'sole':at(fx,fy),'soleY':at(fx,fy)[1]}


def keystrokes(first,second,pose):
    # Paint in the alternate hand/forearm from its independently drawn key.
    # Bidirectional flow follows the fingers between the drawings. The pelvis
    # and head retain their registered rest textures throughout the loop.
    gray=lambda x:np.uint8(cv2.cvtColor(x[:,:,:3],cv2.COLOR_RGB2GRAY)*255)
    ga,gb=gray(first),gray(second)
    def flow(a,b):
        return cv2.calcOpticalFlowFarneback(a,b,None,.5,4,17,4,7,1.3,0)
    ab,ba=flow(ga,gb),flow(gb,ga)
    arms=[]
    for fx,fy in pose['palms']:
        # The upper arm holds its shoulder. The feather includes both cuffs.
        arms.append(np.exp(-(((X-fx)/28)**2+((Y-fy-4)/20)**2)**1.7))
    heel=pose['ankleLine']
    for index in range(8):
        beat=index/8*2*math.pi
        phase=(1-math.cos(beat))/2
        p=np.maximum(arms[0]*phase,arms[1]*phase)
        a=cv2.remap(first,X-ab[:,:,0]*p,Y-ab[:,:,1]*p,cv2.INTER_LINEAR)
        b=cv2.remap(second,X-ba[:,:,0]*(1-p),Y-ba[:,:,1]*(1-p),cv2.INTER_LINEAR)
        image=a*(1-p[:,:,None])+b*p[:,:,None]
        sx=X.copy();sy=Y.copy()
        for n,(fx,fy) in enumerate(pose['palms']):
            finger=np.exp(-((X-fx)/8)**2-((Y-fy)/7)**2)
            wrist=np.exp(-((X-fx)/18)**2-((Y-fy-5)/13)**2)
            press=math.sin(beat+n*2.8)
            sy-=finger*2.3*press+wrist*1.15*math.sin(beat+n*2.8-.48)
        fringe=np.exp(-((Y-202)/35)**2)*np.clip((abs(X-HIP[0])-35)/27,0,1)
        sx-=fringe*1.15*math.sin(beat-.72)
        # A relaxed foot can roll about the ankle without stretching the shin.
        below=np.clip((Y-heel)/14,0,1)
        near=np.clip((X-HIP[0]+8)/28,0,1)
        sx+=below*near*(Y-heel)*.045*phase
        sy+=below*near*.94*phase
        yield rgba(cv2.remap(image,sx,sy,cv2.INTER_LINEAR))


def save_atomic(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    if path.exists() and path.read_bytes()==data:
        return
    with NamedTemporaryFile(dir=path.parent,delete=False) as f:
        scratch=Path(f.name)
        f.write(data)
    try:
        if path.exists():
            path.chmod(0o666)
        os.replace(scratch,path)
    finally:
        scratch.unlink(missing_ok=True)


def build(source,rigs):
    raw=cut_keys(source)
    sheet=Image.new('RGBA',(CELL*8,CELL*2))
    views=[]
    for i in range(2):
        a,landmarks=registration(raw[2*i],rigs[i][0])
        b,_=registration(raw[2*i+1],rigs[i][-1])
        for frame,image in enumerate(keystrokes(a,b,landmarks)):
            sheet.paste(image,(frame*CELL,i*CELL))
        views.append(landmarks)
    out=BytesIO();sheet.save(out,format='WEBP',lossless=True,method=5)
    data=out.getvalue();digest=hashlib.sha256(data).hexdigest()
    path=(ART/(source.stem+'.'+digest[:12]+'.webp')).as_posix()
    # In these two rear paintings the wrists land over the long back hair.
    # The three-quarter keys clearly show the forearms reaching past the body.
    use_oblique=source.stem in ('lu-mi-base','jingyuniang-base')
    return path,data,{'src':'/'+path,'sha256':digest,'cell':[CELL,CELL],'count':8,
                      'preferOblique':use_oblique,'rear':views[0],'oblique':views[1]}


def main():
    import argparse
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--preview',type=Path,help='Build available paintings into an isolated preview directory.')
    args=parser.parse_args()
    rigs=json.loads((SOURCE/'registration.json').read_text(encoding='utf8'))
    keys={f.stem for f in SOURCE.glob('*.png')}
    if args.preview:
        keys&=rigs.keys()
    elif keys!=EXPECTED or set(rigs)!=EXPECTED:
        raise ValueError('Missing or unexpected source paintings or registrations: '+str((keys^EXPECTED,set(rigs)^EXPECTED)))
    meta={};new=[];payloads={}
    for key in sorted(keys):
        path,data,meta[key]=build(SOURCE/(key+'.png'),rigs[key])
        new.append({'path':path,'bytes':len(data),'sha256':meta[key]['sha256']})
        payloads[path]=data
    for path,data in payloads.items():
        for base in ([args.preview] if args.preview else [PLUGIN/'art/release-assets',PLUGIN/'public']):
            save_atomic(base/path,data)
    dump=lambda v:(json.dumps(v,ensure_ascii=False,indent=2)+'\n').encode('utf8')
    if args.preview:
        save_atomic(args.preview/'deskRearPoses.generated.json',dump(meta));return
    manifest=PLUGIN/'lib/asset-manifest.json'
    rows=json.loads(manifest.read_text(encoding='utf8'))
    prev=[r for r in rows if Path(r['path']).parent==ART]
    save_atomic(OFFICE/'deskRearPoses.generated.json',dump(meta))
    save_atomic(manifest,dump([r for r in rows if r not in prev]+new))
    keep={r['path'] for r in new}
    for base in [PLUGIN/'art/release-assets',PLUGIN/'public']:
        for file in (base/ART).iterdir():
            bits=file.name.split('.')
            if len(bits)==3 and bits[0] in EXPECTED and len(bits[1])==12 and (ART/file.name).as_posix() not in keep:
                file.chmod(0o666)
                file.unlink()



if __name__=='__main__':
    main()
